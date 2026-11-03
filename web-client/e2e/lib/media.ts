import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export type TrackTags = {
    title: string;
    artist?: string;
    album?: string;
    genre?: string;
};

export type TrackOptions = Partial<TrackTags> & {
    seconds?: number;
    // A subfolder of the test's folder, which the player's default grouping
    // (%FileDir) turns into a group of its own.
    folder?: string;
    // The file name; track-NN.wav by default.
    name?: string;
};

const sampleRate = 22050;
const tone = 440;

function chunk(id: string, data: Buffer): Buffer {
    const header = Buffer.alloc(8);
    header.write(id, 0, 'ascii');
    header.writeUInt32LE(data.length, 4);
    // Chunks are padded to an even length.
    return Buffer.concat([header, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}

const text = (value: string) => Buffer.concat([Buffer.from(value, 'utf8'), Buffer.alloc(1)]);

// A sine tone as a 16-bit mono WAV with RIFF INFO tags, which the player reads
// as the title, artist, album and genre like any other tags.
export function writeWav(
    file: string,
    seconds: number,
    { title, artist = 'Test Artist', album = 'Test Album', genre = 'Test Genre' }: TrackTags,
) {
    const samples = Math.round(sampleRate * seconds);
    const pcm = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++)
        pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * tone * i) / sampleRate) * 3000), i * 2);
    const format = Buffer.alloc(16);
    format.writeUInt16LE(1, 0); // PCM
    format.writeUInt16LE(1, 2); // channels
    format.writeUInt32LE(sampleRate, 4);
    format.writeUInt32LE(sampleRate * 2, 8); // bytes per second
    format.writeUInt16LE(2, 12); // block align
    format.writeUInt16LE(16, 14); // bits per sample
    const info = Buffer.concat([
        Buffer.from('INFO'),
        chunk('INAM', text(title)),
        chunk('IART', text(artist)),
        chunk('IPRD', text(album)),
        chunk('IGNR', text(genre)),
    ]);
    const body = Buffer.concat([Buffer.from('WAVE'), chunk('fmt ', format), chunk('data', pcm), chunk('LIST', info)]);
    fs.writeFileSync(file, chunk('RIFF', body));
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

function crc32(data: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])));
    return Buffer.concat([length, Buffer.from(type, 'ascii'), data, crc]);
}

// A plain-coloured PNG of the given size.
export function writePng(file: string, width: number, height: number, [r, g, b]: [number, number, number]) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header.writeUInt8(8, 8); // bit depth
    header.writeUInt8(2, 9); // truecolour
    const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
    const pixels = zlib.deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
    fs.writeFileSync(
        file,
        Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            pngChunk('IHDR', header),
            pngChunk('IDAT', pixels),
            pngChunk('IEND', Buffer.alloc(0)),
        ]),
    );
}

// A folder of generated files for one test. The player keeps files open after
// playing them, so the folders are removed with the player, in global setup.
export class MediaFolder {
    readonly files: string[] = [];

    constructor(readonly dir: string) {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
    }

    // The player may still hold the track it was playing; that folder is left to
    // the next run, which clears the media before it starts.
    remove() {
        try {
            fs.rmSync(this.dir, { recursive: true, force: true, maxRetries: 3 });
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== 'EBUSY' && code !== 'EPERM') throw error;
            console.warn(`e2e: ${this.dir} is still in use and stays until the next run`);
        }
    }

    // One track, a few seconds long so that its end is quick to reach.
    track(title: string, { seconds = 3, folder, name, ...tags }: TrackOptions = {}): string {
        const dir = folder ? path.join(this.dir, folder) : this.dir;
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, name ?? `track-${String(this.files.length + 1).padStart(2, '0')}.wav`);
        writeWav(file, seconds, { title, ...tags });
        this.files.push(file);
        return file;
    }

    tracks(count: number, options: Omit<TrackOptions, 'name'> = {}): string[] {
        return Array.from({ length: count }, (_, i) => this.track(`Track ${i + 1}`, options));
    }

    // A CUE sheet that splits one generated track into parts of `seconds` each,
    // which the player lists as tracks of their own inside the container file.
    cue(titles: string[], { seconds = 3, folder = 'album' }: { seconds?: number; folder?: string } = {}): string {
        const dir = path.join(this.dir, folder);
        fs.mkdirSync(dir, { recursive: true });
        const audio = path.join(dir, 'album.wav');
        writeWav(audio, seconds * titles.length, { title: 'Album' });
        const lines = ['PERFORMER "Test Artist"', 'TITLE "Test Album"', 'FILE "album.wav" WAVE'];
        titles.forEach((title, i) => {
            const start = i * seconds;
            const minutes = String(Math.floor(start / 60)).padStart(2, '0');
            const secs = String(start % 60).padStart(2, '0');
            lines.push(
                `  TRACK ${String(i + 1).padStart(2, '0')} AUDIO`,
                `    TITLE "${title}"`,
                `    INDEX 01 ${minutes}:${secs}:00`,
            );
        });
        const sheet = path.join(dir, 'album.cue');
        fs.writeFileSync(sheet, lines.join('\r\n') + '\r\n');
        return sheet;
    }

    // An image the player takes as the cover of the tracks in the folder.
    cover(folder?: string, colour: [number, number, number] = [200, 80, 40]): string {
        const dir = folder ? path.join(this.dir, folder) : this.dir;
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, 'cover.png');
        writePng(file, 300, 300, colour);
        return file;
    }
}

import http from 'node:http';
import type { AddressInfo } from 'node:net';

// A station nothing answers at: port 9 is the discard service, closed on a
// desktop. The player lists it like any other and fails to play it.
export const unreachableStreamUrl = 'http://127.0.0.1:9/radio';

const sampleRate = 22050;
// A second of 16-bit mono silence.
const second = Buffer.alloc(sampleRate * 2);

// A WAV header that names no length, as a broadcast has none.
function endlessWavHeader(): Buffer {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(0xffffffff, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(0xffffffff, 40);
    return header;
}

// Broadcasts silence over HTTP like a radio station: no length, sent as it
// plays. The player takes it for a stream, with no duration to seek in and
// radio capture at hand.
export class StreamServer {
    private readonly server: http.Server;
    private url = '';

    constructor() {
        this.server = http.createServer((_request, response) => {
            response.writeHead(200, { 'Content-Type': 'audio/wav' });
            response.write(endlessWavHeader());
            // A little ahead, so that playback starts at once.
            response.write(second);
            response.write(second);
            const timer = setInterval(() => response.write(second), 1000);
            response.on('close', () => clearInterval(timer));
        });
    }

    async start() {
        await new Promise<void>(resolve => this.server.listen(0, '127.0.0.1', resolve));
        this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    }

    close() {
        this.server.closeAllConnections();
        this.server.close();
    }

    // The URL the player tunes in to.
    station(): string {
        return `${this.url}/station`;
    }
}

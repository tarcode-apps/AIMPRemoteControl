import type { FileFormats, FolderListing } from '@/app/_api/types';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../fixtures';
import { uploadDir } from '../lib/aimp';
import { writeWav } from '../lib/media';

const encode = encodeURIComponent;

test.describe('files', () => {
    test('lists the drives', async ({ api }) => {
        const roots = await api.get<FolderListing>('/files');
        expect(roots.status).toBe(200);
        expect(roots.body!.roots!.map(root => root.path)).toContain('C:\\');
    });

    test('lists a folder: folders and playable files in natural order', async ({ api, media }) => {
        for (const name of ['Track 10.wav', 'Track 9.wav', 'notes.txt'])
            writeWav(path.join(media.dir, name), 1, { title: name });
        fs.mkdirSync(path.join(media.dir, 'Sub folder'));
        fs.writeFileSync(path.join(media.dir, 'list.m3u'), '#EXTM3U\r\n');

        const listing = await api.get<FolderListing>(`/files?path=${encode(media.dir)}`);
        expect(listing.status).toBe(200);
        expect(listing.body!.parent).toBe(path.dirname(media.dir));
        expect(listing.body!.folders).toEqual([{ name: 'Sub folder', path: path.join(media.dir, 'Sub folder') }]);
        // "Track 9" before "Track 10", and only what the player plays.
        expect(listing.body!.files!.map(file => file.name)).toEqual(['Track 9.wav', 'Track 10.wav']);
        expect(listing.body!.files![0]).toMatchObject({ type: 'audio', path: path.join(media.dir, 'Track 9.wav') });

        const withPlaylists = await api.get<FolderListing>(`/files?path=${encode(media.dir)}&types=audio,playlists`);
        expect(withPlaylists.body!.files!.map(file => file.name)).toEqual(['list.m3u', 'Track 9.wav', 'Track 10.wav']);
        const descending = await api.get<FolderListing>(`/files?path=${encode(media.dir)}&descending=true`);
        expect(descending.body!.files!.map(file => file.name)).toEqual(['Track 10.wav', 'Track 9.wav']);
    });

    test('refuses a folder it cannot read and bad queries', async ({ api, media }) => {
        expect((await api.get(`/files?path=${encode(path.join(media.dir, 'missing'))}`)).error?.code).toBe(
            'pathInaccessible',
        );
        expect((await api.get(`/files?path=${encode(media.dir)}&types=video`)).error?.code).toBe('invalidQuery');
        expect((await api.get(`/files?path=${encode(media.dir)}&sort=size`)).error?.code).toBe('invalidQuery');
    });

    test('names the formats the player opens', async ({ api }) => {
        const formats = (await api.get<FileFormats>('/formats')).body!;
        expect(formats.audio).toContain('wav');
        expect(formats.playlists).toEqual(expect.arrayContaining(['m3u', 'cue']));
    });

    test('takes an upload into the upload folder and the playlist', async ({ api, media, playlists }) => {
        const playlist = await playlists.create();
        const source = media.track('Uploaded', { name: 'source.wav' });
        const name = `rc-e2e upload ${Date.now()}.wav`;
        const response = await api.context.post(`/api/v1/playlists/${encode(playlist.id)}/upload`, {
            multipart: { file: { name, mimeType: 'audio/wav', buffer: fs.readFileSync(source) } },
        });
        expect(response.status()).toBe(200);
        const saved = path.join(uploadDir, name);
        expect(fs.existsSync(saved)).toBe(true);
        await expect.poll(async () => (await api.items(playlist.id)).items.map(item => item.fileUri)).toEqual([saved]);

        // A clash gets a numbered name.
        const again = await api.context.post(`/api/v1/playlists/${encode(playlist.id)}/upload`, {
            multipart: { file: { name, mimeType: 'audio/wav', buffer: fs.readFileSync(source) } },
        });
        expect(again.status()).toBe(200);
        expect(fs.existsSync(saved.replace(/\.wav$/, ' (2).wav'))).toBe(true);
    });

    test('refuses an upload without files or into an unknown playlist', async ({ api, playlists }) => {
        const playlist = await playlists.create();
        const empty = await api.context.post(`/api/v1/playlists/${encode(playlist.id)}/upload`, {
            multipart: { note: 'no file here' },
        });
        expect(empty.status()).toBe(400);
        const unknown = await api.context.post(
            `/api/v1/playlists/${encode('{00000000-0000-0000-0000-000000000000}')}/upload`,
            { multipart: { file: { name: 'x.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFF') } } },
        );
        expect(unknown.status()).toBe(404);
    });
});

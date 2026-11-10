import type { FileFormats, FolderListing } from '@/app/_api/types';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../fixtures';
import { defaultPluginSettings, restartThrowawayPlayer, uploadDir } from '../lib/aimp';
import { multipart, startUpload, statusForHeaders, trickleUpload } from '../lib/http';
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

    test('refuses an upload before its body, however large', async ({ playerUrl }) => {
        const path = `/api/v1/playlists/${encode('{00000000-0000-0000-0000-000000000000}')}/upload`;
        const headers = { 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': 1_500_000_000 };
        expect(await statusForHeaders(playerUrl, path, headers)).toBe(404);
    });

    test('writes an upload to disk as it arrives, and keeps none of a body that breaks off', async ({
        api,
        playerUrl,
        playlists,
    }) => {
        const playlist = await playlists.create();
        const folder = `rc-e2e broken ${Date.now()}`;
        const first = `${folder}/first.wav`;
        const upload = startUpload(
            playerUrl,
            `/api/v1/playlists/${encode(playlist.id)}/upload`,
            first,
            `${folder}/second.wav`,
        );
        // On disk while the body is still coming.
        await expect.poll(() => fs.existsSync(path.join(uploadDir, first))).toBe(true);
        upload.breakOff();
        await expect.poll(() => fs.existsSync(path.join(uploadDir, folder))).toBe(false);
        expect(await api.playlistItemCount(playlist.id)).toBe(0);
    });
});

test.describe('uploads', () => {
    const stamp = () => `${Date.now()}`;

    test('keeps the folders of an upload, and the player adds what it plays', async ({ api, media, playlists }) => {
        const playlist = await playlists.create();
        const album = `rc-e2e Album ${stamp()}`;
        const response = await api.context.post(
            `/api/v1/playlists/${encode(playlist.id)}/upload`,
            multipart([
                { name: `${album}/CD1/One.wav`, content: fs.readFileSync(media.track('One')) },
                { name: `${album}/cover.jpg`, content: 'not a picture' },
                { name: `${album}/notes.txt`, content: 'notes' },
                { name: `${album} Loose.wav`, content: fs.readFileSync(media.track('Loose')) },
            ]),
        );
        expect(response.status()).toBe(200);
        const folder = path.join(uploadDir, album);
        expect(fs.readFileSync(path.join(folder, 'cover.jpg'), 'utf8')).toBe('not a picture');
        expect(fs.existsSync(path.join(folder, 'notes.txt'))).toBe(true);
        // The player expands the folder in the background.
        await expect
            .poll(async () => (await api.allItems(playlist.id)).map(item => item.fileUri))
            .toEqual([path.join(folder, 'CD1', 'One.wav'), path.join(uploadDir, `${album} Loose.wav`)]);
    });

    test('puts the upload where asked', async ({ api, media, playlists }) => {
        const playlist = await playlists.create({ tracks: 3 });
        const [a, b, c] = playlist.files.map(file => path.basename(file));
        const name = stamp();
        const send = async (query: string, files: string[]) => {
            const response = await api.context.post(
                `/api/v1/playlists/${encode(playlist.id)}/upload?${query}`,
                multipart(files.map(file => ({ name: file, content: fs.readFileSync(media.track('Sent')) }))),
            );
            expect(response.status()).toBe(200);
        };
        const names = async () => (await api.allItems(playlist.id)).map(item => path.basename(item.fileUri));

        // The player adds in the background, so each step waits for the last.
        await send('placement=at&index=1', [`at ${name}.wav`]);
        await expect.poll(names).toEqual([a, `at ${name}.wav`, b, c]);
        await send('placement=start', [`start ${name}.wav`]);
        await expect.poll(async () => (await names())[0]).toBe(`start ${name}.wav`);
        await send('placement=end', [`end ${name}.wav`]);
        await expect.poll(names).toEqual([`start ${name}.wav`, a, `at ${name}.wav`, b, c, `end ${name}.wav`]);
        // A folder is expanded at the index, its files in order.
        await send('placement=at&index=2', [`pair ${name}/2.wav`, `pair ${name}/1.wav`]);
        await expect.poll(async () => (await names()).slice(1, 5)).toEqual([a, '1.wav', '2.wav', `at ${name}.wav`]);
        await send('placement=at&index=1000', [`past ${name}.wav`]);
        await expect.poll(async () => (await names()).at(-1)).toBe(`past ${name}.wav`);
        // A folder large enough to be expanded well after the answer keeps its place.
        const many = Array.from({ length: 30 }, (_, i) => `${String(i + 1).padStart(2, '0')}.wav`);
        await send(
            'placement=at&index=1',
            many.map(file => `many ${name}/${file}`),
        );
        await expect.poll(async () => (await names()).slice(0, 32)).toEqual([`start ${name}.wav`, ...many, a]);
    });

    test('scatters an upload over the playlist', async ({ api, media, playlists }) => {
        const playlist = await playlists.create({ tracks: 6 });
        const before = playlist.files.map(file => path.basename(file));
        const name = stamp();
        const sent = [1, 2, 3].map(n => `scattered ${name} ${n}.wav`);
        const response = await api.context.post(
            `/api/v1/playlists/${encode(playlist.id)}/upload?placement=scatter`,
            multipart(sent.map(file => ({ name: file, content: fs.readFileSync(media.track('Sent')) }))),
        );
        expect(response.status()).toBe(200);
        const after = (await api.allItems(playlist.id)).map(item => path.basename(item.fileUri));
        expect(after).toHaveLength(9);
        expect(after).toEqual(expect.arrayContaining(sent));
        expect(after.filter(file => before.includes(file))).toEqual(before);
    });

    test('refuses a bad placement and a path out of its folder, writing nothing', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: 1 });
        const name = `rc-e2e refused ${stamp()}.wav`;
        const send = (query: string, file = name) =>
            api.context.post(
                `/api/v1/playlists/${encode(playlist.id)}/upload${query}`,
                multipart([{ name: file, content: 'data' }]),
            );
        const refusal = async (query: string, file?: string) => {
            const response = await send(query, file);
            return `${response.status()} ${(await response.json()).error.code}`;
        };

        expect(await refusal('?placement=middle')).toBe('400 invalidQuery');
        expect(await refusal('?placement=at')).toBe('400 invalidQuery');
        expect(await refusal('?placement=at&index=-1')).toBe('400 invalidQuery');
        expect(fs.existsSync(path.join(uploadDir, name))).toBe(false);

        for (const file of [`../${name}`, `folder/../../${name}`, `/${name}`, `a//${name}`])
            expect(await refusal('', file)).toBe('400 invalidBody');
        expect(fs.existsSync(path.join(uploadDir, '..', name))).toBe(false);

        // Refused after a file it took: the file goes, and so does the connection,
        // which the rest of the body would otherwise follow into the next request.
        const late = await api.context.post(
            `/api/v1/playlists/${encode(playlist.id)}/upload`,
            multipart([
                { name, content: 'data' },
                { name: `../${name}`, content: 'data' },
            ]),
        );
        expect(late.status()).toBe(400);
        expect(late.headers().connection).toBe('close');
        expect(fs.existsSync(path.join(uploadDir, name))).toBe(false);
        expect(await api.playlistItemCount(playlist.id)).toBe(1);
    });

    test('uploads into a new playlist, created once the files are in', async ({ api, media, playerUrl }) => {
        const before = (await api.playlists()).map(playlist => playlist.id);
        const broken = `rc-e2e new broken ${stamp()}`;
        const upload = startUpload(
            playerUrl,
            '/api/v1/playlists/upload',
            `${broken}/first.wav`,
            `${broken}/second.wav`,
        );
        await expect.poll(() => fs.existsSync(path.join(uploadDir, broken))).toBe(true);
        upload.breakOff();
        await expect.poll(() => fs.existsSync(path.join(uploadDir, broken))).toBe(false);
        expect((await api.playlists()).map(playlist => playlist.id)).toEqual(before);

        const album = `rc-e2e new ${stamp()}`;
        const response = await api.context.post(
            '/api/v1/playlists/upload',
            multipart([{ name: `${album}/One.wav`, content: fs.readFileSync(media.track('One')) }]),
        );
        expect(response.status()).toBe(200);
        const { id } = (await response.json()) as { id: string };
        try {
            expect(before).not.toContain(id);
            await expect
                .poll(async () => (await api.allItems(id)).map(item => item.fileUri))
                .toEqual([path.join(uploadDir, album, 'One.wav')]);
        } finally {
            await api.deletePlaylist(id);
        }
    });

    // The helper kills a player that has not quit in 15 s; this one quits at once.
    test('an upload on its way does not keep the player from quitting', async ({ playerUrl, playlists }) => {
        test.skip(!!process.env.E2E_PLAYER_URL, 'needs the throwaway player, which E2E_PLAYER_URL replaces');
        const playlist = await playlists.create();
        const name = `rc-e2e trickle ${stamp()}.wav`;
        const upload = trickleUpload(playerUrl, `/api/v1/playlists/${encode(playlist.id)}/upload`, name);
        try {
            await expect.poll(() => fs.existsSync(path.join(uploadDir, name))).toBe(true);
            const started = Date.now();
            await restartThrowawayPlayer(playerUrl, defaultPluginSettings);
            expect(Date.now() - started).toBeLessThan(12_000);
            expect(fs.existsSync(path.join(uploadDir, name))).toBe(false);
        } finally {
            upload.stop();
        }
    });

    test('names its limit and refuses a larger body before reading it', async ({ api, playerUrl, playlists }) => {
        const settings = (await api.get<{ uploadLimit: number; uploadFileLimit: number }>('/settings')).body!;
        expect(settings).toMatchObject({ uploadLimit: 16 * 1024 ** 3, uploadFileLimit: 100_000 });
        const { uploadLimit } = settings;
        const playlist = await playlists.create();
        const headers = { 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': uploadLimit + 1 };
        expect(await statusForHeaders(playerUrl, `/api/v1/playlists/${encode(playlist.id)}/upload`, headers)).toBe(413);
        expect(await statusForHeaders(playerUrl, '/api/v1/playlists/upload', headers)).toBe(413);
    });
});

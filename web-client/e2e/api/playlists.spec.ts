import type { ItemDetailsResponse, LocateResponse, Lyrics, PlaylistItemsPage, TrackInfo } from '@/app/_api/types';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../fixtures';

const encode = encodeURIComponent;
const unknownId = '{00000000-0000-0000-0000-000000000000}';

test.describe('playlists', () => {
    test('creates, renames and deletes a playlist', async ({ api }) => {
        const created = await api.post<{ id: string }>('/playlists', { name: 'rc-e2e created' });
        expect(created.status).toBe(200);
        const id = created.body!.id;
        try {
            const listed = await api.playlist(id);
            expect(listed).toMatchObject({ name: 'rc-e2e created', itemCount: 0, readOnly: false });
            expect(listed!.revision).toBeGreaterThan(0);

            expect((await api.patch(`/playlists/${encode(id)}`, { name: 'rc-e2e renamed' })).status).toBe(200);
            expect((await api.playlist(id))?.name).toBe('rc-e2e renamed');
        } finally {
            expect((await api.delete(`/playlists/${encode(id)}`)).status).toBe(200);
        }
        expect(await api.playlist(id)).toBeUndefined();
    });

    // The throwaway player has no language files, so its default name for a new
    // playlist is empty until the content names it.
    test('lets the player name a playlist created or renamed without a name', async ({ api, media, playlists }) => {
        const created = await api.post<{ id: string }>('/playlists', {});
        const id = created.body!.id;
        try {
            await api.addFiles(id, [media.track('Named', { album: 'Auto Album' })]);
            await expect.poll(async () => (await api.playlist(id))?.name).toBe('Auto Album');
        } finally {
            await api.deletePlaylist(id);
        }

        const playlist = await playlists.create({ name: 'rc-e2e named', tracks: [{ album: 'Other Album' }] });
        expect((await api.patch(`/playlists/${encode(playlist.id)}`, { name: '' })).status).toBe(200);
        await expect.poll(async () => (await api.playlist(playlist.id))?.name).toBe('Other Album');
    });

    test('reports the view settings and the grouping', async ({ api, playlists }) => {
        const playlist = await playlists.create();
        const listed = await api.playlist(playlist.id);
        for (const field of [
            'showNumbers',
            'absoluteNumbers',
            'showDuration',
            'showSecondLine',
            'showThumbnails',
            'showMarks',
        ])
            expect(typeof listed![field as keyof typeof listed], field).toBe('boolean');
        expect(listed!.grouping).toEqual({
            enabled: expect.any(Boolean),
            template: expect.any(String),
            autoMerge: expect.any(Boolean),
        });
    });

    test('refuses bad requests and unknown playlists', async ({ api }) => {
        expect((await api.post('/playlists', { name: 5 })).error?.code).toBe('invalidBody');
        expect((await api.patch(`/playlists/${encode(unknownId)}`, { name: 'x' })).error?.code).toBe(
            'playlistNotFound',
        );
        expect((await api.delete(`/playlists/${encode(unknownId)}`)).error?.code).toBe('playlistNotFound');
        expect((await api.get(`/playlists/${encode(unknownId)}/items`)).error?.code).toBe('playlistNotFound');
    });

    test('counts its changes in the revision and announces them', async ({ api, events, playlists }) => {
        const playlist = await playlists.create();
        const before = (await api.playlist(playlist.id))!.revision;
        const announced = events.next<{ playlists: { id: string; revision: number }[] }>('playlists', data =>
            data.playlists.some(p => p.id === playlist.id && p.revision > before),
        );
        await api.patch(`/playlists/${encode(playlist.id)}`, { name: 'rc-e2e revised' });
        await announced;
        expect((await api.playlist(playlist.id))!.revision).toBeGreaterThan(before);
    });
});

test.describe('items', () => {
    test('lists the tracks with their tags and totals', async ({ api, playlists }) => {
        const playlist = await playlists.create({
            tracks: [
                { title: 'Один', artist: 'Артист', seconds: 2 },
                { title: 'Two', seconds: 3 },
            ],
        });
        const page = await api.items(playlist.id);
        expect(page.total).toBe(2);
        expect(page.offset).toBe(0);
        expect(page.revision).toBe((await api.playlist(playlist.id))!.revision);
        expect(page.items.map(item => item.index)).toEqual([0, 1]);
        expect(page.items[0].displayText).toContain('Один');
        expect(page.items[0].displayText).toContain('Артист');
        expect(page.items[0]).toMatchObject({
            duration: expect.closeTo(2, 0),
            mark: 0,
            enabled: true,
            isUrl: false,
            inContainer: false,
            fileUri: playlist.files[0],
        });
        expect(page.items[0].size).toBeGreaterThan(0);
        const listed = await api.playlist(playlist.id);
        expect(listed!.duration).toBeCloseTo(5, 0);
        expect(listed!.size).toBe(page.items[0].size + page.items[1].size);
    });

    test('pages and refuses pages out of bounds', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: 5 });
        const page = await api.items(playlist.id, '?offset=2&limit=2');
        expect(page).toMatchObject({ total: 5, offset: 2 });
        expect(page.items.map(item => item.index)).toEqual([2, 3]);
        expect((await api.items(playlist.id, '?offset=4&limit=10')).items).toHaveLength(1);
        for (const query of ['?limit=0', '?limit=501', '?offset=-1', '?limit=x'])
            expect((await api.get(`/playlists/${encode(playlist.id)}/items${query}`)).error?.code, query).toBe(
                'invalidQuery',
            );
    });

    test('searches the playlist, case-insensitively, with the totals of the matches', async ({ api, playlists }) => {
        const playlist = await playlists.create({
            tracks: [
                { title: 'Morning Song', seconds: 2 },
                { title: 'Evening', seconds: 3 },
                { title: 'Late MORNING', seconds: 4 },
            ],
        });
        const page = await api.items(playlist.id, '?search=%20morning%20');
        expect(page.total).toBe(2);
        expect(page.items.map(item => item.index)).toEqual([0, 2]);
        expect((page as PlaylistItemsPage & { duration: number }).duration).toBeCloseTo(6, 0);
        expect((await api.items(playlist.id, '?search=%20%20')).total).toBe(3);
        expect((await api.items(playlist.id, '?search=nothing-like-this')).total).toBe(0);
    });

    test('appends files, folders and URLs, and refuses bad ones', async ({ api, media, playlists }) => {
        const playlist = await playlists.create();
        media.tracks(2, { folder: 'folder' });
        expect(
            (await api.post(`/playlists/${encode(playlist.id)}/items`, { files: [`${media.dir}\\folder`] })).status,
        ).toBe(200);
        await expect.poll(() => api.playlistItemCount(playlist.id)).toBe(2);

        const url = 'http://127.0.0.1:9/rc-e2e-stream';
        expect((await api.post(`/playlists/${encode(playlist.id)}/items`, { urls: [url] })).status).toBe(200);
        await expect.poll(() => api.playlistItemCount(playlist.id)).toBe(3);
        const stream = (await api.items(playlist.id)).items[2];
        expect(stream).toMatchObject({ isUrl: true, fileUri: url });

        const route = `/playlists/${encode(playlist.id)}/items`;
        expect((await api.post(route, {})).error?.code).toBe('invalidBody');
        expect((await api.post(route, { urls: ['no-scheme'] })).error?.code).toBe('invalidBody');
        expect((await api.post(`/playlists/${encode(unknownId)}/items`, { urls: [url] })).error?.code).toBe(
            'playlistNotFound',
        );
    });

    test('marks an item with stars', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: 2 });
        const route = `/playlists/${encode(playlist.id)}/items/1/mark`;
        expect((await api.patch(route, { mark: 4 })).status).toBe(200);
        await expect.poll(async () => (await api.items(playlist.id)).items[1].mark).toBe(4);
        expect((await api.items(playlist.id)).items[1].displayingMark).toBe(4);
        expect((await api.patch(route, { mark: 0 })).status).toBe(200);
        await expect.poll(async () => (await api.items(playlist.id)).items[1].mark).toBe(0);

        expect((await api.patch(route, { mark: 6 })).error?.code).toBe('invalidBody');
        expect((await api.patch(`/playlists/${encode(playlist.id)}/items/9/mark`, { mark: 1 })).error?.code).toBe(
            'itemNotFound',
        );
    });

    test('switches items out of playback, one at a time and by selection', async ({ api, playlists }) => {
        const playlist = await playlists.create({
            tracks: [{ folder: 'Album A' }, { folder: 'Album A' }, { folder: 'Album B' }],
        });
        expect((await api.playlist(playlist.id))!.showSwitches).toBe(true);
        const enabled = async () => (await api.items(playlist.id)).items.map(item => item.enabled);
        const enabledCounts = async () => (await api.groups(playlist.id)).groups.map(group => group.enabledCount);
        const route = `/playlists/${encode(playlist.id)}/items`;

        expect((await api.patch(`${route}/1/enabled`, { enabled: false })).status).toBe(200);
        await expect.poll(enabled).toEqual([true, false, true]);
        expect(await enabledCounts()).toEqual([1, 1]);
        expect(
            (await api.post(`${route}/enabled`, { search: '', groups: [0], except: [], enabled: false })).status,
        ).toBe(200);
        await expect.poll(enabled).toEqual([false, false, true]);
        expect(await enabledCounts()).toEqual([0, 1]);
        expect((await api.post(`${route}/enabled`, { indexes: [0, 2], enabled: true })).status).toBe(200);
        await expect.poll(enabled).toEqual([true, false, true]);

        expect((await api.patch(`${route}/1/enabled`, {})).error?.code).toBe('invalidBody');
        expect((await api.patch(`${route}/9/enabled`, { enabled: true })).error?.code).toBe('itemNotFound');
        expect((await api.post(`${route}/enabled`, { indexes: [9], enabled: true })).error?.code).toBe('itemNotFound');
        const revision = (await api.playlist(playlist.id))!.revision;
        expect(
            (await api.post(`${route}/enabled`, { indexes: [0], enabled: false, revision: revision + 100 })).error
                ?.code,
        ).toBe('playlistChanged');
    });

    test('details the chosen items with their tags', async ({ api, playlists }) => {
        const playlist = await playlists.create({
            tracks: [
                { title: 'First', artist: 'Artist A', album: 'Album A', genre: 'Rock', folder: 'Folder A' },
                { title: 'Second' },
            ],
        });
        const route = `/playlists/${encode(playlist.id)}/items/details`;
        const details = await api.post<ItemDetailsResponse>(route, { indexes: [0] });
        expect(details.status).toBe(200);
        expect(details.body!.items).toHaveLength(1);
        expect(details.body!.items[0]).toMatchObject({
            index: 0,
            artist: 'Artist A',
            album: 'Album A',
            genre: 'Rock',
            folder: 'Folder A',
            fileUri: playlist.files[0],
        });

        expect((await api.post<ItemDetailsResponse>(route, { search: '' })).body!.items).toHaveLength(2);
        expect((await api.post(route, { indexes: [5] })).error?.code).toBe('itemNotFound');
        const revision = (await api.playlist(playlist.id))!.revision;
        expect((await api.post(route, { indexes: [0], revision: revision + 100 })).error?.code).toBe('playlistChanged');
    });

    test('describes a track by its file: tags, stream, statistics', async ({ api, playlists }) => {
        const playlist = await playlists.create({
            tracks: [
                {
                    title: 'Described',
                    artist: 'An Artist',
                    albumArtist: 'The Band',
                    year: '1999',
                    trackNumber: '3',
                    lyricist: 'A Poet',
                    seconds: 2,
                },
            ],
        });
        const route = (uri: string) => `/playlists/${encode(playlist.id)}/items/info?uri=${encode(uri)}`;
        const described = await api.get<TrackInfo>(route(playlist.files[0]));
        expect(described.status).toBe(200);
        expect(described.body).toMatchObject({
            playlistId: playlist.id,
            index: 0,
            fileUri: playlist.files[0],
            fileName: path.basename(playlist.files[0]),
            isUrl: false,
            inContainer: false,
            title: 'Described',
            artist: 'An Artist',
            album: 'Test Album',
            albumArtist: 'The Band',
            genre: 'Test Genre',
            year: '1999',
            trackNumber: '3',
            lyricist: 'A Poet',
            format: 'WAVE (PCM)',
            sampleRate: 22050,
            bitDepth: 16,
            channels: 1,
            playCount: 0,
            lastPlayed: null,
        });
        expect(described.body!.duration).toBeCloseTo(2, 1);
        expect(described.body!.size).toBeGreaterThan(0);
        expect(described.body!.revision).toBe((await api.playlist(playlist.id))!.revision);

        expect((await api.get(route('C:\\no\\such\\file.wav'))).error?.code).toBe('itemNotFound');
        expect((await api.get(`/playlists/${encode(playlist.id)}/items/info`)).error?.code).toBe('invalidQuery');
        expect((await api.get(`/playlists/${encode(unknownId)}/items/info?uri=x`)).error?.code).toBe(
            'playlistNotFound',
        );
    });

    test('gives the lyrics: the tag first, synced or plain, then a file beside the track, then the comment, or none', async ({
        api,
        playlists,
    }) => {
        const lrc = '[00:01.50] First line\n[00:03.00] Second line\n';
        const playlist = await playlists.create({
            tracks: [
                { title: 'Synced', lrc },
                { title: 'Plain', lyrics: 'One\nTwo\n\n' },
                { title: 'Silent' },
                // What AIMP's tag editor writes for pasted LRC: plain and synced frames.
                {
                    title: 'Synced tag',
                    lyrics: 'Tag one\nTag two',
                    syncedLyrics: [
                        [2, 'Tag one'],
                        [4.25, 'Tag two'],
                    ],
                },
                { title: 'Tag and file', lyrics: 'From the tag', lrc },
                // The comment stands in for lyrics only where there are none at all.
                { title: 'Comment only', comment: 'Just a comment' },
                { title: 'Comment and file', comment: 'Just a comment', lrc },
            ],
        });
        const route = (uri: string) => `/playlists/${encode(playlist.id)}/items/lyrics?uri=${encode(uri)}`;
        const synced = await api.get<Lyrics>(route(playlist.files[0]));
        expect(synced.status).toBe(200);
        expect(synced.body).toEqual({
            type: 'synced',
            lines: [
                { time: 1.5, text: 'First line' },
                { time: 3, text: 'Second line' },
            ],
        });
        expect((await api.get<Lyrics>(route(playlist.files[1]))).body).toEqual({
            type: 'unsynced',
            lines: [{ text: 'One' }, { text: 'Two' }],
        });
        expect((await api.get<Lyrics>(route(playlist.files[2]))).body).toEqual({ type: 'none', lines: [] });
        expect((await api.get<Lyrics>(route(playlist.files[3]))).body).toEqual({
            type: 'synced',
            lines: [
                { time: 2, text: 'Tag one' },
                { time: 4.25, text: 'Tag two' },
            ],
        });
        // The tag outweighs the file beside the track, as in the player.
        expect((await api.get<Lyrics>(route(playlist.files[4]))).body).toEqual({
            type: 'unsynced',
            lines: [{ text: 'From the tag' }],
        });
        expect((await api.get<Lyrics>(route(playlist.files[5]))).body).toEqual({
            type: 'unsynced',
            lines: [{ text: 'Just a comment' }],
        });
        expect((await api.get<Lyrics>(route(playlist.files[6]))).body).toMatchObject({ type: 'synced' });

        expect((await api.get(route('C:\\no\\such\\file.wav'))).error?.code).toBe('itemNotFound');
        expect((await api.get(`/playlists/${encode(playlist.id)}/items/lyrics`)).error?.code).toBe('invalidQuery');
        expect((await api.get(`/playlists/${encode(unknownId)}/items/lyrics?uri=x`)).error?.code).toBe(
            'playlistNotFound',
        );
    });

    test('sends the file of a track, the audio a CUE part is cut from, and no file for a stream', async ({
        api,
        media,
        playlists,
    }) => {
        const sheet = media.cue(['Part one', 'Part two']);
        const name = 'Трек один.wav';
        const playlist = await playlists.create({
            tracks: [{ title: 'One', name }, { title: 'Gone' }],
            files: [sheet],
            expectItems: 4,
        });
        const items = `/playlists/${encode(playlist.id)}/items`;
        await api.post(items, { urls: ['http://127.0.0.1:9/radio'] });
        await expect.poll(() => api.playlistItemCount(playlist.id)).toBe(5);
        const route = (uri: string) => `${items}/file?uri=${encode(uri)}`;
        const download = (uri: string, headers?: Record<string, string>) =>
            api.context.get(`/api/v1${route(uri)}`, { headers });

        const file = await download(playlist.files[0]);
        expect(file.status()).toBe(200);
        expect(file.headers()['content-type']).toBe('audio/wav');
        expect(file.headers()['content-disposition']).toBe(
            `attachment; filename="____ ____.wav"; filename*=UTF-8''${encode(name)}`,
        );
        expect((await file.body()).equals(fs.readFileSync(playlist.files[0]))).toBe(true);
        // A download the browser resumes asks for the rest.
        const rest = await download(playlist.files[0], { Range: 'bytes=100-' });
        expect(rest.status()).toBe(206);
        expect((await rest.body()).equals(fs.readFileSync(playlist.files[0]).subarray(100))).toBe(true);

        const listed = (await api.items(playlist.id)).items;
        const part = listed.find(item => item.inContainer)!;
        const album = await download(part.fileUri);
        expect(album.status()).toBe(200);
        expect(album.headers()['content-disposition']).toContain('filename="album.wav"');
        expect((await album.body()).equals(fs.readFileSync(path.join(path.dirname(sheet), 'album.wav')))).toBe(true);

        const stream = listed.find(item => item.isUrl)!;
        expect((await api.get(route(stream.fileUri))).error?.code).toBe('fileNotFound');
        fs.rmSync(playlist.files[1]);
        expect((await api.get(route(playlist.files[1]))).error?.code).toBe('fileNotFound');

        expect((await api.get(route('C:\\no\\such\\file.wav'))).error?.code).toBe('itemNotFound');
        expect((await api.get(`${items}/file`)).error?.code).toBe('invalidQuery');
        expect((await api.get(`/playlists/${encode(unknownId)}/items/file?uri=x`)).error?.code).toBe(
            'playlistNotFound',
        );
    });

    test('locates remembered files in their own playlists only', async ({ api, playlists }) => {
        const first = await playlists.create({ name: 'rc-e2e locate one', tracks: 3 });
        const second = await playlists.create({ name: 'rc-e2e locate two', tracks: 1 });
        const located = await api.post<LocateResponse>('/playlists/locate', {
            items: [
                { fileUri: first.files[2], playlistId: first.id },
                { fileUri: first.files[0], playlistId: second.id },
                { fileUri: 'C:\\no\\such\\file.wav', playlistId: first.id },
            ],
        });
        expect(located.status).toBe(200);
        expect(located.body!.found).toHaveLength(1);
        expect(located.body!.found[0]).toMatchObject({ fileUri: first.files[2], playlistId: first.id, index: 2 });
        expect((await api.post('/playlists/locate', { items: 'x' })).error?.code).toBe('invalidBody');
    });
});

test.describe('order', () => {
    // The player's own sort by title leaves generated WAV files as they are, so the
    // orders by a field are checked by duration, file name and template.
    test('sorts by a field, descending, by a template and back', async ({ api, playlists }) => {
        const playlist = await playlists.create({
            tracks: [
                { title: 'Bravo', seconds: 3 },
                { title: 'Charlie', seconds: 4 },
                { title: 'Alpha', seconds: 2 },
            ],
        });
        const route = `/playlists/${encode(playlist.id)}/sort`;
        const titles = async () =>
            (await api.items(playlist.id)).items.map(item => item.displayText.replace(/^.* - /, ''));

        expect((await api.post(route, { by: 'duration' })).status).toBe(200);
        await expect.poll(titles).toEqual(['Alpha', 'Bravo', 'Charlie']);
        expect((await api.post(route, { by: 'fileName', descending: true })).status).toBe(200);
        await expect.poll(titles).toEqual(['Alpha', 'Charlie', 'Bravo']);
        expect((await api.post(route, { by: 'inverse' })).status).toBe(200);
        await expect.poll(titles).toEqual(['Bravo', 'Charlie', 'Alpha']);
        expect((await api.post(route, { by: 'template', template: '%Title', descending: true })).status).toBe(200);
        await expect.poll(titles).toEqual(['Charlie', 'Bravo', 'Alpha']);

        expect((await api.post(route, { by: 'nonsense' })).error?.code).toBe('invalidBody');
        expect((await api.post(route, { by: 'template' })).error?.code).toBe('invalidBody');
        const revision = (await api.playlist(playlist.id))!.revision;
        expect((await api.post(route, { by: 'title', revision: revision + 100 })).error?.code).toBe('playlistChanged');
    });

    test('moves items to a target in the resulting playlist', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: 5 });
        const route = `/playlists/${encode(playlist.id)}/items/move`;
        const order = async () =>
            (await api.items(playlist.id)).items.map(item => playlist.files.indexOf(item.fileUri));

        expect((await api.post(route, { indexes: [3, 0], target: 2 })).status).toBe(200);
        await expect.poll(order).toEqual([1, 2, 0, 3, 4]);
        expect((await api.post(route, { indexes: [4], target: 0 })).status).toBe(200);
        await expect.poll(order).toEqual([4, 1, 2, 0, 3]);

        expect((await api.post(route, { indexes: [9], target: 0 })).error?.code).toBe('itemNotFound');
        expect((await api.post(route, { indexes: [0] })).error?.code).toBe('invalidBody');
    });
});

test.describe('groups', () => {
    test('lists the folders as groups and collapses them', async ({ api, playlists }) => {
        const playlist = await playlists.create({
            tracks: [
                { folder: 'Album A', seconds: 2 },
                { folder: 'Album A', seconds: 2 },
                { folder: 'Album B', seconds: 3 },
            ],
        });
        const groups = await api.groups(playlist.id);
        expect(groups.groups.map(group => [group.name, group.count, group.firstPosition])).toEqual([
            ['Album A', 2, 0],
            ['Album B', 1, 2],
        ]);
        expect(groups.groups[0].duration).toBeCloseTo(4, 0);

        const route = `/playlists/${encode(playlist.id)}/groups`;
        expect((await api.patch(`${route}/1`, { expanded: false })).status).toBe(200);
        await expect
            .poll(async () => (await api.groups(playlist.id)).groups.map(g => g.expanded))
            .toEqual([true, false]);
        expect((await api.patch(route, { expanded: false })).status).toBe(200);
        await expect
            .poll(async () => (await api.groups(playlist.id)).groups.map(g => g.expanded))
            .toEqual([false, false]);
        expect((await api.patch(route, { expanded: true })).status).toBe(200);
        await expect
            .poll(async () => (await api.groups(playlist.id)).groups.map(g => g.expanded))
            .toEqual([true, true]);

        expect((await api.patch(`${route}/7`, { expanded: false })).error?.code).toBe('groupNotFound');
        expect((await api.patch(`${route}/0`, {})).error?.code).toBe('invalidBody');
        const revision = (await api.playlist(playlist.id))!.revision;
        expect((await api.patch(`${route}/0`, { expanded: false, revision: revision + 100 })).error?.code).toBe(
            'playlistChanged',
        );
    });

    test('describes the matches of a search only', async ({ api, playlists }) => {
        const playlist = await playlists.create({
            tracks: [
                { title: 'Keep one', folder: 'Album A' },
                { title: 'Skip', folder: 'Album A' },
                { title: 'Skip too', folder: 'Album B' },
                { title: 'Keep two', folder: 'Album C' },
            ],
        });
        const groups = await api.groups(playlist.id, '?search=keep');
        expect(groups.groups.map(group => [group.index, group.name, group.count, group.firstPosition])).toEqual([
            [0, 'Album A', 1, 0],
            [2, 'Album C', 1, 1],
        ]);
    });
});

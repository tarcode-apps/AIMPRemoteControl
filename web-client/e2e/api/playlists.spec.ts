import type { ItemDetailsResponse, LocateResponse, PlaylistItemsPage } from '@/app/_api/types';
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
        const route = `/playlists/${encode(playlist.id)}/items/1`;
        expect((await api.patch(route, { mark: 4 })).status).toBe(200);
        await expect.poll(async () => (await api.items(playlist.id)).items[1].mark).toBe(4);
        expect((await api.items(playlist.id)).items[1].displayingMark).toBe(4);
        expect((await api.patch(route, { mark: 0 })).status).toBe(200);
        await expect.poll(async () => (await api.items(playlist.id)).items[1].mark).toBe(0);

        expect((await api.patch(route, { mark: 6 })).error?.code).toBe('invalidBody');
        expect((await api.patch(`/playlists/${encode(playlist.id)}/items/9`, { mark: 1 })).error?.code).toBe(
            'itemNotFound',
        );
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

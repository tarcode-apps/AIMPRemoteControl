import type { SearchPage } from '@/app/_api/types';
import { expect, test } from '../fixtures';

const unknownId = '{00000000-0000-0000-0000-000000000000}';

test.describe('search', () => {
    test('finds matches across playlists, grouped by playlist', async ({ api, playlists }) => {
        // A word no other playlist of the player holds.
        const word = `zebra${Date.now()}`;
        const first = await playlists.create({
            tracks: [{ title: `${word} one`, seconds: 2 }, { title: 'Other' }, { title: `${word} two`, seconds: 3 }],
        });
        const second = await playlists.create({ tracks: [{ title: `${word} three`, seconds: 4 }] });

        const result = await api.get<SearchPage>(`/search?search=${word}`);
        expect(result.status).toBe(200);
        const page = result.body!;
        expect(page.total).toBe(3);
        expect(page.duration).toBeCloseTo(9, 0);
        expect(page.items.map(item => [item.playlistId, item.index])).toEqual([
            [first.id, 0],
            [first.id, 2],
            [second.id, 0],
        ]);
        expect(page.playlists.map(p => [p.id, p.count])).toEqual([
            [first.id, 2],
            [second.id, 1],
        ]);
        expect(page.items[0].revision).toBe((await api.playlist(first.id))!.revision);
    });

    test('looks through the chosen fields and playlists only, and pages', async ({ api, playlists }) => {
        const word = `quokka${Date.now()}`;
        const first = await playlists.create({
            tracks: [{ title: word }, { title: 'Plain', artist: word }, { title: 'Plain', album: word }],
        });
        const second = await playlists.create({ tracks: [{ title: word }] });

        const byArtist = await api.get<SearchPage>(`/search?search=${word}&fields=artist`);
        expect(byArtist.body!.items.map(item => item.index)).toEqual([1]);
        const byTitleAndAlbum = await api.get<SearchPage>(`/search?search=${word}&fields=title,album`);
        expect(byTitleAndAlbum.body!.total).toBe(3);
        const inFirst = await api.get<SearchPage>(`/search?search=${word}&playlists=${encodeURIComponent(first.id)}`);
        expect(inFirst.body!.total).toBe(3);
        expect(inFirst.body!.playlists.map(p => p.id)).toEqual([first.id]);
        const byFile = await api.get<SearchPage>(`/search?search=${encodeURIComponent('track-02.wav')}&fields=file`);
        expect(byFile.body!.items.some(item => item.fileUri === first.files[1])).toBe(true);

        const paged = await api.get<SearchPage>(`/search?search=${word}&offset=1&limit=2`);
        expect(paged.body!.total).toBe(4);
        expect(paged.body!.items.map(item => [item.playlistId, item.index])).toEqual([
            [first.id, 1],
            [first.id, 2],
        ]);
        expect(second.files).toHaveLength(1);
    });

    test('refuses a search without text, an unknown field or playlist', async ({ api }) => {
        expect((await api.get('/search')).error?.code).toBe('invalidQuery');
        expect((await api.get('/search?search=%20')).error?.code).toBe('invalidQuery');
        expect((await api.get('/search?search=a&fields=lyrics')).error?.code).toBe('invalidQuery');
        expect((await api.get('/search?search=a&limit=0')).error?.code).toBe('invalidQuery');
        expect((await api.get(`/search?search=a&playlists=${encodeURIComponent(unknownId)}`)).error?.code).toBe(
            'playlistNotFound',
        );
    });
});

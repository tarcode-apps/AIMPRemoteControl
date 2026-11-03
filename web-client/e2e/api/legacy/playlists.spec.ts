import { expect, test } from '../../fixtures';
import { legacyEntries, legacyPlaylistId, legacyPlaylists, legacyTrackIds } from '../../lib/legacy';

test.describe('frozen protocol: playlists and entries', () => {
    test('GetPlaylists lists the asked fields with a checksum that follows the content', async ({
        api,
        media,
        playlists,
    }) => {
        const playlist = await playlists.create({ tracks: 2 });
        const listed = (await legacyPlaylists(api)).find(p => p.title === playlist.name)!;
        expect(listed).toMatchObject({ readonly: false, entries_count: 2 });
        expect(Number.isInteger(listed.id)).toBe(true);
        expect(listed.id).toBeGreaterThanOrEqual(0);

        const only = await api.rpcResult<Record<string, unknown>[]>('GetPlaylists', { fields: ['id', 'title'] });
        expect(Object.keys(only[0]).sort()).toEqual(['id', 'title']);

        await api.addFiles(playlist.id, [media.track('More')]);
        await expect
            .poll(async () => (await legacyPlaylists(api)).find(p => p.id === listed.id)?.crc32)
            .not.toBe(listed.crc32);
    });

    test('GetPlaylistEntries returns rows in the order of the fields', async ({ api, playlists }) => {
        const playlist = await playlists.create({
            tracks: [
                { title: 'First', artist: 'Artist A', album: 'Album A', genre: 'Rock', seconds: 2.4 },
                { title: 'Second', seconds: 3 },
            ],
        });
        const legacyId = await legacyPlaylistId(api, playlist.name);
        const result = await api.rpcResult<{
            count_of_found_entries: number;
            total_entries_count: number;
            entries: unknown[][];
        }>('GetPlaylistEntries', {
            playlist_id: legacyId,
            fields: ['title', 'artist', 'album', 'genre', 'duration', 'filename', 'enabled', 'nonsense'],
        });
        expect(result.count_of_found_entries).toBe(2);
        expect(result.total_entries_count).toBe(2);
        // Durations in whole seconds rounded up, as milliseconds.
        expect(result.entries[0]).toEqual([
            'First',
            'Artist A',
            'Album A',
            'Rock',
            3000,
            playlist.files[0],
            true,
            null,
        ]);
    });

    test('GetPlaylistEntries searches every playlist', async ({ api, playlists }) => {
        const word = `ibis${Date.now()}`;
        const playlist = await playlists.create({ tracks: [{ title: `${word} one` }, { title: 'Other' }] });
        const legacyId = await legacyPlaylistId(api, playlist.name);
        const result = await api.rpcResult<{
            count_of_found_entries: number;
            total_entries_count?: number;
            entries: unknown[][];
        }>('GetPlaylistEntries', { search_string: word.toUpperCase(), fields: ['title', 'playlist_id'] });
        expect(result.count_of_found_entries).toBe(1);
        expect(result.total_entries_count).toBeUndefined();
        expect(result.entries).toEqual([[`${word} one`, legacyId]]);
    });

    test('GetPlaylistEntryInfo details a track, and refuses an unknown one', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: [{ title: 'Detailed', artist: 'Artist A', seconds: 2 }] });
        const legacyId = await legacyPlaylistId(api, playlist.name);
        const [trackId] = await legacyTrackIds(api, legacyId);
        const info = await api.rpcResult<Record<string, unknown>>('GetPlaylistEntryInfo', { track_id: trackId });
        expect(info).toMatchObject({
            id: trackId,
            playlist_id: legacyId,
            title: 'Detailed',
            artist: 'Artist A',
            duration: 2000,
            samplerate: 22050,
            channels_count: 1,
        });
        expect((await api.rpc('GetPlaylistEntryInfo', { track_id: 12345 })).error?.code).toBe(21);
    });

    test('CreatePlaylist, PlaylistRename and PlaylistRemove manage a playlist', async ({ api }) => {
        const created = await api.rpcResult<{ playlist_id: number }>('CreatePlaylist', { title: 'rc-e2e legacy' });
        expect(Number.isInteger(created.playlist_id)).toBe(true);
        try {
            expect(
                await api.rpcResult('PlaylistRename', {
                    playlist_id: created.playlist_id,
                    new_name: 'rc-e2e legacy 2',
                }),
            ).toEqual({
                success: true,
            });
            expect((await legacyPlaylists(api)).find(p => p.id === created.playlist_id)?.title).toBe('rc-e2e legacy 2');
        } finally {
            expect(await api.rpcResult('PlaylistRemove', { playlist_id: created.playlist_id })).toEqual({
                success: true,
            });
        }
        expect((await legacyPlaylists(api)).some(p => p.id === created.playlist_id)).toBe(false);
        expect((await api.rpc('PlaylistRename', { playlist_id: created.playlist_id, new_name: 'x' })).error?.code).toBe(
            20,
        );
        expect((await api.rpc('PlaylistRemove', { playlist_id: created.playlist_id })).error?.code).toBe(20);
        // An unknown playlist has no entries rather than an error.
        expect(await api.rpcResult('GetPlaylistEntries', { playlist_id: created.playlist_id, fields: ['id'] })).toEqual(
            {
                count_of_found_entries: 0,
                total_entries_count: 0,
                entries: [],
            },
        );
    });

    test('a playlist keeps its legacy id while the web API renames it', async ({ api, playlists }) => {
        const playlist = await playlists.create();
        const legacyId = await legacyPlaylistId(api, playlist.name);
        await api.patch(`/playlists/${encodeURIComponent(playlist.id)}`, { name: 'rc-e2e renamed via web' });
        expect((await legacyPlaylists(api)).find(p => p.id === legacyId)?.title).toBe('rc-e2e renamed via web');
        expect((await legacyEntries(api, legacyId, ['id'])).length).toBe(0);
    });
});

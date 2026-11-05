import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../../fixtures';
import { legacyEntries, legacyPlaylistId, legacyTrackIds } from '../../lib/legacy';

test.describe('frozen protocol: tracks', () => {
    test('SetTrackRating and SetTrackEnabled change the track', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: 2 });
        const legacyId = await legacyPlaylistId(api, playlist.name);
        const [first] = await legacyTrackIds(api, legacyId);

        expect(await api.rpcResult('SetTrackRating', { track_id: first, rating: 3 })).toEqual({ rating: 3 });
        await expect.poll(async () => (await api.items(playlist.id)).items[0].mark).toBe(3);
        expect(await api.rpcResult('SetTrackEnabled', { track_id: first, enabled: false })).toEqual({ success: true });
        await expect.poll(async () => (await api.items(playlist.id)).items[0].enabled).toBe(false);
        expect((await legacyEntries(api, legacyId, ['rating', 'enabled']))[0]).toEqual({ rating: 3, enabled: false });

        expect((await api.rpc('SetTrackRating', { track_id: 7, rating: 3 })).error?.code).toBe(21);
    });

    test('EnqueueTrack, GetQueuedEntries and RemoveTrackFromPlayQueue manage the queue', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: 3 });
        const legacyId = await legacyPlaylistId(api, playlist.name);
        const ids = await legacyTrackIds(api, legacyId);

        expect((await api.rpc('EnqueueTrack', { track_id: ids[2] })).result).toBeNull();
        await api.rpcResult('EnqueueTrack', { track_id: ids[0], insert_at_queue_beginning: true });
        const queued = await api.rpcResult<{ count_of_found_entries: number; entries: unknown[][] }>(
            'GetQueuedEntries',
            {
                fields: ['id', 'queue_index'],
            },
        );
        expect(queued.count_of_found_entries).toBe(2);
        expect(queued.entries).toEqual([
            [ids[0], 0],
            [ids[2], 1],
        ]);

        expect((await api.rpc('RemoveTrackFromPlayQueue', { track_id: ids[0] })).result).toBeNull();
        expect((await api.queue()).items.map(item => item.index)).toEqual([2]);
        // Not queued is no error.
        expect((await api.rpc('RemoveTrackFromPlayQueue', { track_id: ids[1] })).error).toBeUndefined();
        expect((await api.rpc('EnqueueTrack', { track_id: 9 })).error?.code).toBe(21);
    });

    test('RemoveTrack takes the entry out, and the file too when asked', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: 3 });
        const legacyId = await legacyPlaylistId(api, playlist.name);
        const ids = await legacyTrackIds(api, legacyId);

        expect(
            await api.rpcResult('RemoveTrack', { playlist_id: legacyId, track_id: ids[0], physically: false }),
        ).toEqual({
            success: true,
        });
        await expect.poll(() => api.playlistItemCount(playlist.id)).toBe(2);
        expect(fs.existsSync(playlist.files[0])).toBe(true);

        // Ids shift with the indexes once the playlist changes.
        const [next] = await legacyTrackIds(api, legacyId);
        expect(await api.rpcResult('RemoveTrack', { playlist_id: legacyId, track_id: next, physically: true })).toEqual(
            {
                success: true,
            },
        );
        await expect.poll(() => fs.existsSync(playlist.files[1])).toBe(false);
    });

    test('GetCover points at the album art the HTTP endpoint serves', async ({ api, media, playlists }) => {
        media.cover('album');
        const playlist = await playlists.create({ tracks: [{ folder: 'album' }, {}] });
        const legacyId = await legacyPlaylistId(api, playlist.name);
        const [withCover, without] = await legacyTrackIds(api, legacyId);

        const cover = await api.rpcResult<{ album_cover_uri: string }>('GetCover', { track_id: withCover });
        expect(cover.album_cover_uri).toMatch(new RegExp(`^album_covers_cache/cover_0_${withCover}_0x0_\\d+\\.png$`));
        const image = await api.context.get(`/${cover.album_cover_uri}`);
        expect(image.status()).toBe(200);
        expect(image.headers()['content-type']).toBe('image/png');

        expect((await api.rpc('GetCover', { track_id: without })).error?.code).toBe(22);
        expect((await api.rpc('Lyrics', { track_id: without })).error?.code).toBe(35);
    });

    test('Lyrics gives the plain text, the tag first, lines joined with CRLF', async ({ api, playlists }) => {
        const lrc = '[00:01.00] From the file\n[00:02.00] Second file line\n';
        const playlist = await playlists.create({
            tracks: [{ lrc }, { lyrics: 'From the tag\nSecond tag line', lrc }, {}],
        });
        const legacyId = await legacyPlaylistId(api, playlist.name);
        const [fileOnly, tagAndFile, without] = await legacyTrackIds(api, legacyId);

        expect(await api.rpcResult('Lyrics', { track_id: fileOnly })).toEqual({
            text: 'From the file\r\nSecond file line',
        });
        expect(await api.rpcResult('Lyrics', { track_id: tagAndFile })).toEqual({
            text: 'From the tag\r\nSecond tag line',
        });
        expect((await api.rpc('Lyrics', { track_id: without })).error?.code).toBe(35);
        expect((await api.rpc('Lyrics', { track_id: 77 })).error?.code).toBe(21);
    });

    test('downloadTrack sends the file with its raw UTF-8 name', async ({ api, media, playlists }) => {
        const name = 'Трек один.wav';
        const playlist = await playlists.create({ tracks: [{ name }] });
        const legacyId = await legacyPlaylistId(api, playlist.name);
        const [trackId] = await legacyTrackIds(api, legacyId);

        const response = await api.context.get(`/downloadTrack/playlist_id/${legacyId}/track_id/${trackId}`);
        expect(response.status()).toBe(200);
        const disposition = Buffer.from(
            response.headersArray().find(h => h.name.toLowerCase() === 'content-disposition')!.value,
            'latin1',
        ).toString('utf8');
        expect(disposition).toBe(`attachment; filename="${name}"`);
        expect((await response.body()).equals(fs.readFileSync(path.join(media.dir, name)))).toBe(true);
        expect((await api.context.get(`/downloadTrack/playlist_id/${legacyId}/track_id/77`)).status()).toBe(404);
    });
});

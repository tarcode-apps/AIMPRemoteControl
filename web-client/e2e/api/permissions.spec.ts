import fs from 'node:fs';
import { expect, test, withPluginSettings } from '../fixtures';
import { legacyPlaylistId, legacyTrackIds } from '../lib/legacy';
import { unreachableStreamUrl } from '../lib/streams';

const encode = encodeURIComponent;

test.describe('with deletion, download, upload and the timer disallowed', () => {
    withPluginSettings({ physicalDeletion: false, downloadTracks: false, uploadTracks: false, scheduler: false });

    test('the settings and the capabilities tell so', async ({ api }) => {
        expect((await api.get('/settings')).body).toEqual({
            permissions: {
                downloadTracks: false,
                uploadTracks: false,
                browseFiles: true,
                physicalDeletion: false,
                scheduler: false,
            },
        });
        expect(await api.rpcResult('PluginCapabilities')).toEqual({
            physical_track_deletion: false,
            upload_track: false,
            scheduler: { supported: true, allowed: false },
        });
    });

    test('files stay on disk, while removing from the playlist still works', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: 3 });
        const route = `/playlists/${encode(playlist.id)}/items/remove`;
        const refused = await api.post(route, { indexes: [0], physically: true });
        expect(refused.status).toBe(403);
        expect(refused.error?.code).toBe('physicalDeletionDisabled');
        expect(await api.playlistItemCount(playlist.id)).toBe(3);

        const legacyId = await legacyPlaylistId(api, playlist.name);
        const [first] = await legacyTrackIds(api, legacyId);
        expect(
            (await api.rpc('RemoveTrack', { playlist_id: legacyId, track_id: first, physically: true })).error?.code,
        ).toBe(28);
        expect(fs.existsSync(playlist.files[0])).toBe(true);

        expect((await api.post(route, { indexes: [0] })).status).toBe(200);
        await expect.poll(() => api.playlistItemCount(playlist.id)).toBe(2);
        expect(fs.existsSync(playlist.files[0])).toBe(true);
    });

    test('downloads are refused in both protocols', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: 1 });
        const refused = await api.get(`/playlists/${encode(playlist.id)}/items/file?uri=${encode(playlist.files[0])}`);
        expect(refused.status).toBe(403);
        expect(refused.error?.code).toBe('downloadDisabled');

        const legacyId = await legacyPlaylistId(api, playlist.name);
        const [first] = await legacyTrackIds(api, legacyId);
        // The app reads the file name from the refusal too, before its download manager hears 403.
        const legacy = await api.context.get(`/downloadTrack/playlist_id/${legacyId}/track_id/${first}`);
        expect(legacy.status()).toBe(403);
        expect(legacy.headers()['content-disposition']).toBe('attachment; filename="track-01.wav"');
    });

    test('uploads are refused before anything is written', async ({ api, media, playlists }) => {
        const playlist = await playlists.create();
        const buffer = fs.readFileSync(media.track('Refused'));
        const file = { name: 'refused.wav', mimeType: 'audio/wav', buffer };

        const web = await api.context.post(`/api/v1/playlists/${encode(playlist.id)}/upload`, {
            multipart: { file },
        });
        expect(web.status()).toBe(403);
        expect((await web.json()).error.code).toBe('uploadDisabled');

        const legacyId = await legacyPlaylistId(api, playlist.name);
        expect((await api.context.post(`/uploadTrack/playlist_id/${legacyId}`, { multipart: { file } })).status()).toBe(
            403,
        );
        expect(await api.playlistItemCount(playlist.id)).toBe(0);
    });

    test('the timer is refused in both protocols', async ({ api }) => {
        const set = await api.put('/timer', { actions: ['pause'], trigger: 'after', seconds: 60 });
        expect(set.status).toBe(403);
        expect(set.error?.code).toBe('schedulerDisabled');
        expect((await api.delete('/timer')).error?.code).toBe('schedulerDisabled');
        expect((await api.rpc('Scheduler')).error?.code).toBe(-1);
        expect((await api.rpc('Scheduler', { action: 'pause_playback', expiration_delay: 60 })).error?.code).toBe(-1);
    });

    // The app reaches the computer's files through its upload menu only.
    test('the frozen protocol browses only with upload allowed too', async ({ api, media }) => {
        media.track('Visible');
        expect((await api.get(`/files?path=${encode(media.dir)}`)).status).toBe(200);
        expect((await api.rpc('BrowseFiles', { path: media.dir })).error?.code).toBe(33);
    });
});

test.describe('with browsing disallowed', () => {
    withPluginSettings({ browseFiles: false });

    test('the settings tell so', async ({ api }) => {
        expect((await api.get('/settings')).body).toMatchObject({ permissions: { browseFiles: false } });
    });

    test('files are neither listed nor added by path, while streams still are', async ({ api, media, playlists }) => {
        const file = media.track('Hidden');
        const roots = await api.get('/files');
        expect(roots.status).toBe(403);
        expect(roots.error?.code).toBe('browseFilesDisabled');
        expect((await api.get(`/files?path=${encode(media.dir)}`)).error?.code).toBe('browseFilesDisabled');

        const playlist = await playlists.create();
        const route = `/playlists/${encode(playlist.id)}/items`;
        const refused = await api.post(route, { files: [file] });
        expect(refused.status).toBe(403);
        expect(refused.error?.code).toBe('browseFilesDisabled');
        expect((await api.post(route, { urls: [unreachableStreamUrl] })).status).toBe(200);
        await expect.poll(() => api.playlistItemCount(playlist.id)).toBe(1);

        const legacyId = await legacyPlaylistId(api, playlist.name);
        expect((await api.rpc('BrowseFiles')).error?.code).toBe(33);
        expect((await api.rpc('AddFiles', { playlist_id: legacyId, files: [file] })).error?.code).toBe(27);
        expect(await api.playlistItemCount(playlist.id)).toBe(1);
    });
});

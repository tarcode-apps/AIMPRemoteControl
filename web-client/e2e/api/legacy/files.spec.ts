import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../../fixtures';
import { uploadDir } from '../../lib/aimp';
import { legacyPlaylistId } from '../../lib/legacy';
import { unreachableStreamUrl } from '../../lib/streams';

test.describe('frozen protocol: files', () => {
    test('GetFormats names the playable extensions', async ({ api }) => {
        const result = await api.rpcResult<{ formats: string[] }>('GetFormats');
        expect(result.formats).toContain('wav');
    });

    test('BrowseFiles lists the drives and a folder by name', async ({ api, media }) => {
        const roots = await api.rpcResult<{ labels: string[]; paths: string[] }>('BrowseFiles');
        expect(roots.paths).toContain('C:\\');
        expect(roots.labels).toHaveLength(roots.paths.length);

        media.track('b', { name: 'b.wav' });
        media.track('a', { name: 'A.wav' });
        fs.writeFileSync(path.join(media.dir, 'notes.txt'), 'x');
        fs.mkdirSync(path.join(media.dir, 'Folder'));
        const folder = await api.rpcResult<{ files: string[]; folders: string[] }>('BrowseFiles', { path: media.dir });
        expect(folder.files).toEqual(['A.wav', 'b.wav']);
        expect(folder.folders).toEqual(['Folder']);
        expect((await api.rpc('BrowseFiles', { path: path.join(media.dir, 'missing') })).error?.code).toBe(33);
    });

    test('AddFiles and AddURLToPlaylist append to a playlist', async ({ api, media, playlists }) => {
        const playlist = await playlists.create();
        const legacyId = await legacyPlaylistId(api, playlist.name);
        const file = media.track('Added');
        expect(await api.rpcResult('AddFiles', { playlist_id: legacyId, files: [file] })).toEqual({ success: true });
        await expect.poll(() => api.playlistItemCount(playlist.id)).toBe(1);
        expect(
            (await api.rpc('AddURLToPlaylist', { playlist_id: legacyId, url: unreachableStreamUrl })).result,
        ).toBeNull();
        await expect.poll(() => api.playlistItemCount(playlist.id)).toBe(2);
        expect((await api.rpc('AddFiles', { playlist_id: 5, files: [file] })).error?.code).toBe(20);
    });

    test('uploadTrack saves the file and appends it', async ({ api, media, playlists }) => {
        const playlist = await playlists.create();
        const legacyId = await legacyPlaylistId(api, playlist.name);
        const name = `rc-e2e legacy ${Date.now()}.wav`;
        const buffer = fs.readFileSync(media.track('Uploaded', { name: 'source.wav' }));
        const response = await api.context.post(`/uploadTrack/playlist_id/${legacyId}`, {
            multipart: { [name]: { name, mimeType: 'application/octet-stream', buffer } },
        });
        expect(response.status()).toBe(200);
        expect(fs.existsSync(path.join(uploadDir, name))).toBe(true);
        await expect.poll(() => api.playlistItemCount(playlist.id)).toBe(1);

        const unknown = await api.context.post('/uploadTrack/playlist_id/5', {
            multipart: { [name]: { name, mimeType: 'application/octet-stream', buffer } },
        });
        expect(unknown.status()).toBe(404);
    });

    test('ShowMessage is accepted', async ({ api }) => {
        expect(await api.rpcResult('ShowMessage', { message: 'rc-e2e connected' })).toEqual({ success: true });
    });
});

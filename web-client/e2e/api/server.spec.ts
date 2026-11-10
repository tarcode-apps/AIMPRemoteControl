import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../fixtures';
import { uploadDir } from '../lib/aimp';
import { statusForHeaders } from '../lib/http';
import { legacyPlaylistId } from '../lib/legacy';

// What the HTTP server does around the API: the web client's files, misses,
// malformed bodies and the size limits.
test.describe('server', () => {
    test('serves the web client and its routes', async ({ api }) => {
        const home = await api.context.get('/');
        expect(home.status()).toBe(200);
        expect(home.headers()['content-type']).toContain('text/html');
        // A client route reloads from its own index.html.
        const route = await api.context.get('/timer/');
        expect(route.status()).toBe(200);
        expect(await route.text()).toContain('<html');
    });

    test('answers a miss with 404, and refuses paths outside the client', async ({ api }) => {
        const miss = await api.context.get('/no-such-page/');
        expect(miss.status()).toBe(404);
        const outside = await api.context.get('/..%2F..%2F..%2FWindows%2Fwin.ini');
        expect(outside.status()).toBe(404);
        expect(await outside.text()).not.toContain('[fonts]');
    });

    test('refuses malformed JSON and unknown routes of the API', async ({ api }) => {
        const malformed = await api.context.fetch('/api/v1/effects', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            data: Buffer.from('{ not json'),
        });
        expect(malformed.status()).toBe(400);
        expect((await malformed.json()).error.code).toBe('invalidJson');
        expect((await api.context.get('/api/v1/nothing-here')).status()).toBe(404);
    });

    test('refuses a JSON-RPC body over 16 MB before reading it', async ({ playerUrl }) => {
        const contentType = 'application/json';
        expect(
            await statusForHeaders(playerUrl, '/RPC_JSON', {
                'Content-Type': contentType,
                'Content-Length': 16 * 1024 * 1024 + 1,
            }),
        ).toBe(413);
        expect(
            await statusForHeaders(playerUrl, '/api/v1/effects', {
                'Content-Type': contentType,
                'Content-Length': 17 * 1024 * 1024,
            }),
        ).toBe(413);
    });

    // The cap is for JSON alone: the upload endpoints take far more.
    test('takes an upload larger than the JSON cap at both upload endpoints', async ({ api, media, playlists }) => {
        const playlist = await playlists.create();
        const source = media.track('Large', { seconds: 480 });
        const buffer = fs.readFileSync(source);
        expect(buffer.length).toBeGreaterThan(20 * 1024 * 1024);
        const names = ['web', 'legacy'].map(kind => `rc-e2e large ${kind}.wav`);
        try {
            const web = await api.context.post(`/api/v1/playlists/${encodeURIComponent(playlist.id)}/upload`, {
                multipart: { file: { name: names[0], mimeType: 'audio/wav', buffer } },
                timeout: 120_000,
            });
            expect(web.status()).toBe(200);
            const legacyId = await legacyPlaylistId(api, playlist.name);
            const legacy = await api.context.post(`/uploadTrack/playlist_id/${legacyId}`, {
                multipart: { [names[1]]: { name: names[1], mimeType: 'application/octet-stream', buffer } },
                timeout: 120_000,
            });
            expect(legacy.status()).toBe(200);
            for (const name of names) expect(fs.statSync(path.join(uploadDir, name)).size).toBe(buffer.length);
            await expect.poll(() => api.playlistItemCount(playlist.id)).toBe(2);
        } finally {
            for (const name of names) fs.rmSync(path.join(uploadDir, name), { force: true });
        }
    });
});

import { expect, test } from '../fixtures';

const encode = encodeURIComponent;

test.describe('covers', () => {
    test('redirects an item to its cover by hash, which serves the image', async ({ api, media, playlists }) => {
        media.cover('album');
        const playlist = await playlists.create({ tracks: [{ folder: 'album' }, { folder: 'album' }] });
        const [first, second] = (await api.items(playlist.id)).items;
        expect(first.cover).not.toBe('');

        const redirect = await api.get(`/playlists/${encode(playlist.id)}/items/0/cover?key=${first.cover}&size=128`);
        expect(redirect.status).toBe(302);
        expect(redirect.headers['cache-control']).toBe('no-store');
        const location = redirect.headers.location;
        expect(location).toMatch(/^\/api\/v1\/covers\/[0-9a-f]+\?size=128$/);

        // The tracks of one folder share one image, so one hash.
        const other = await api.get(`/playlists/${encode(playlist.id)}/items/1/cover?key=${second.cover}&size=128`);
        expect(other.headers.location).toBe(location);

        const image = await api.context.get(location);
        expect(image.status()).toBe(200);
        expect(image.headers()['content-type']).toBe('image/png');
        expect(image.headers()['cache-control']).toContain('immutable');
        const bytes = await image.body();
        // Scaled down to the longer side asked for: 300 px becomes 128.
        expect(bytes.readUInt32BE(16)).toBe(128);
        expect(bytes.readUInt32BE(20)).toBe(128);
    });

    test("serves the playing track's cover by the hash in the player state", async ({ api, media, playlists }) => {
        media.cover('album');
        const playlist = await playlists.create({ tracks: [{ folder: 'album', seconds: 20 }] });
        await api.play(playlist.id, 0);
        await expect.poll(async () => (await api.player()).track?.coverHash ?? '').not.toBe('');
        const hash = (await api.player()).track!.coverHash;
        const original = await api.context.get(`/api/v1/covers/${hash}?size=original`);
        expect(original.status()).toBe(200);
        expect((await original.body()).readUInt32BE(16)).toBe(300);
    });

    test('answers 404 without a cover or with a stale key', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: 1 });
        const item = (await api.items(playlist.id)).items[0];
        const missing = await api.get(`/playlists/${encode(playlist.id)}/items/0/cover?key=${item.cover}`);
        expect(missing.status).toBe(404);
        expect(missing.error?.code).toBe('coverNotFound');
        expect((await api.get(`/playlists/${encode(playlist.id)}/items/0/cover?key=0000`)).error?.code).toBe(
            'coverNotFound',
        );
        expect((await api.get(`/playlists/${encode(playlist.id)}/items/3/cover?key=x`)).error?.code).toBe(
            'itemNotFound',
        );
        expect((await api.get('/covers/0123456789abcdef0123456789abcdef')).error?.code).toBe('coverNotFound');
        expect(
            (await api.get(`/playlists/${encode(playlist.id)}/items/0/cover?key=${item.cover}&size=-5`)).error?.code,
        ).toBe('invalidQuery');
    });
});

import type { TestPlaylist } from '../fixtures';
import { expect, test } from './fixtures';
import { PlaylistScreen } from './pages/playlist-screen';

// Longer than two of the client's pages of 200 items, so that the last one is
// fetched only when the list comes near it. Short tracks keep the files small;
// the last one, which a test plays, lasts long enough to be seen playing.
const trackCount = 450;

// Titles of one width, so that none is the start of another: a row's text runs
// the title straight into the duration ("Track 0010:00").
const track = (number: number) => `Track ${String(number).padStart(3, '0')}`;

test.describe('a long playlist', () => {
    let playlist: TestPlaylist;
    let screen: PlaylistScreen;

    test.beforeEach(async ({ app, playlists }) => {
        playlist = await playlists.create({
            tracks: Array.from({ length: trackCount }, (_, i) => ({
                title: track(i + 1),
                seconds: i === trackCount - 1 ? 30 : 0.2,
            })),
        });
        screen = new PlaylistScreen(app, playlist.name);
    });

    test('loads its pages as the list scrolls to them', async ({ api, page }) => {
        const offsets = new Set<number>();
        page.on('request', request => {
            const url = new URL(request.url());
            if (url.pathname.endsWith('/items') && decodeURIComponent(url.pathname).includes(playlist.id))
                offsets.add(Number(url.searchParams.get('offset') ?? 0));
        });
        await screen.open();
        await expect(screen.row(track(1))).toBeVisible();
        expect([...offsets].sort((a, b) => a - b)).toEqual([0, 200]);

        await screen.scrollTo(1);
        await expect(screen.row(track(trackCount))).toBeInViewport();
        expect(offsets).toContain(400);

        await screen.play(track(trackCount));
        await expect.poll(async () => (await api.player()).track?.index).toBe(trackCount - 1);
    });

    test('comes back where it was left after other playlists', async ({ app, playlists }) => {
        const second = new PlaylistScreen(app, (await playlists.create({ name: 'rc-e2e Second', tracks: 3 })).name);
        // Two playlists away on a mobile, past the neighbours its pager keeps.
        const third = new PlaylistScreen(app, (await playlists.create({ name: 'rc-e2e Third', tracks: 3 })).name);
        await screen.open();
        await screen.scrollTo(0.5);
        const left = await screen.scrollTop();
        expect(left).toBeGreaterThan(0);

        await second.show();
        await third.show();
        await screen.show();
        await expect.poll(async () => Math.abs((await screen.scrollTop()) - left)).toBeLessThanOrEqual(1);
    });
});

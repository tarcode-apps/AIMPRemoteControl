import { defaultPluginSettings, restartThrowawayPlayer } from '../lib/aimp';
import { expect, test } from './fixtures';
import { PlaylistScreen } from './pages/playlist-screen';

// The stream of the player's events, which the client keeps open on its own:
// the browser reopens a dropped stream, but gives up for good on an answer that
// is no stream, which is what a proxy sends while the player is down.
test.describe('events', () => {
    test('the client gets the stream back after the player restarts behind a proxy', async ({
        app,
        page,
        playerUrl,
        playlists,
    }) => {
        test.skip(!!process.env.E2E_PLAYER_URL, 'needs the throwaway player, which E2E_PLAYER_URL replaces');
        test.setTimeout(120_000);
        const before = await playlists.create({ name: 'rc-e2e Gannet' });
        await new PlaylistScreen(app, before.name).open();

        // As the Next dev server answers for a player it cannot reach.
        await page.route('**/api/v1/events', route => route.fulfill({ status: 502 }));
        const refused = page.waitForResponse(
            response => response.url().endsWith('/api/v1/events') && response.status() === 502,
        );
        await Promise.all([restartThrowawayPlayer(playerUrl, defaultPluginSettings), refused]);
        await page.unroute('**/api/v1/events');

        const after = await playlists.create({ name: 'rc-e2e Gannet 2' });
        await app.openDrawer();
        // The retries during the restart may have grown to their cap of 30 s.
        await expect(app.playlistLink(after.name)).toBeVisible({ timeout: 35_000 });
    });
});

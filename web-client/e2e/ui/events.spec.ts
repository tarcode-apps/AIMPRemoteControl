import type { Page } from '@playwright/test';
import { defaultPluginSettings, restartThrowawayPlayer } from '../lib/aimp';
import { expect, test } from './fixtures';
import { PlaylistScreen } from './pages/playlist-screen';
import { t, textPattern } from './strings';

// As a mobile hides the page while its screen is off and shows it once unlocked.
async function sleepAndWake(page: Page) {
    await page.evaluate(() => {
        for (const state of ['hidden', 'visible']) {
            Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
            document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
        }
    });
}

// Whether the connection banner has come up since this was called.
async function watchBanner(page: Page): Promise<() => Promise<boolean>> {
    await page.evaluate(() => {
        const root = document.documentElement;
        root.dataset.bannerShown = 'false';
        new MutationObserver(() => {
            if (root.classList.contains('has-connection-banner')) root.dataset.bannerShown = 'true';
        }).observe(root, { attributes: true, attributeFilter: ['class'] });
    });
    return async () => (await page.evaluate(() => document.documentElement.dataset.bannerShown)) === 'true';
}

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

    test('a lost player shows the banner instead of errors, and the player stands still', async ({
        api,
        app,
        page,
        player,
        playlists,
    }) => {
        const playlist = await playlists.create({ tracks: [{ title: 'Alpha', seconds: 60 }] });
        await api.play(playlist.id, 0);
        await expect.poll(async () => (await api.player()).state).toBe('playing');
        // A mobile opens on the expanded player.
        await app.goto('/');
        const banner = page.getByTestId('connection-banner');
        await expect(banner).toBeHidden();

        // As the player's address stops answering; the open stream is not cut.
        await page.route('**/api/v1/**', route => route.abort('connectionrefused'));
        await player.nextButton.click();
        await expect(banner.getByRole('status')).toHaveText(t('connection.lost'));
        await expect(banner.getByText(textPattern('connection.retryIn'))).toBeVisible();
        await expect(app.toast).toBeHidden();
        await expect(player.nextButton).toBeDisabled();
        const stopped = await player.positionSlider.inputValue();
        await page.waitForTimeout(2000);
        await expect(player.positionSlider).toHaveValue(stopped);

        await page.unroute('**/api/v1/**');
        await banner.getByRole('button', { name: t('connection.retry') }).click();
        await expect(banner.getByRole('status')).toHaveText(t('connection.restored'));
        await expect(banner).toBeHidden();
        await expect(player.nextButton).toBeEnabled();
        expect((await api.player()).track?.title).toBe('Alpha');
    });

    test('without the player no screen opens, as one would end on the browser error page', async ({
        api,
        app,
        page,
        playlists,
    }) => {
        const playlist = await playlists.create({ tracks: [{ title: 'Alpha', seconds: 60 }] });
        await api.play(playlist.id, 0);
        await expect.poll(async () => (await api.player()).state).toBe('playing');
        const screen = new PlaylistScreen(app, playlist.name);
        await screen.open();
        const url = page.url();
        const banner = page.getByTestId('connection-banner');

        await page.route('**/*', route => route.abort('connectionrefused'));
        await page
            .getByRole('button', { name: t('player.holdToSeek', { action: t('player.next') }), exact: true })
            .first()
            .click();
        await expect(banner.getByRole('status')).toHaveText(t('connection.lost'));

        // Never loaded before, so Next would load the whole page.
        await screen.more(t('search.title'));
        await app.openDrawer();
        await app.navigationLink(t('screens.timer')).click();
        await page.waitForTimeout(500);
        await expect(page).toHaveURL(url);
        await expect(screen.list).toBeVisible();

        await page.unroute('**/*');
        await banner.getByRole('button', { name: t('connection.retry') }).click();
        await expect(banner).toBeHidden();
        await app.openScreen(t('screens.timer'));
    });

    test('just awake, a network back within seconds brings no banner', async ({ api, app, page, playlists }) => {
        const playlist = await playlists.create({ tracks: [{ title: 'Alpha', seconds: 60 }] });
        await api.play(playlist.id, 0);
        await expect.poll(async () => (await api.player()).state).toBe('playing');
        await new PlaylistScreen(app, playlist.name).open();
        const bannerShown = await watchBanner(page);

        // The player's state is read again on waking, before the network is up.
        await page.route('**/api/v1/**', route => route.abort('connectionrefused'));
        const failed = page.waitForEvent('requestfailed', request => request.url().includes('/api/v1/'));
        await sleepAndWake(page);
        await failed;
        await page.waitForTimeout(1500);
        const reopened = page.waitForResponse(response => response.url().endsWith('/api/v1/events') && response.ok());
        await page.unroute('**/api/v1/**');
        await reopened;
        await page.waitForTimeout(500);
        expect(await bannerShown()).toBe(false);
        await expect(app.toast).toBeHidden();
    });

    test('just awake, a player still away brings the banner once the wait is over', async ({
        api,
        app,
        page,
        playlists,
    }) => {
        const playlist = await playlists.create({ tracks: [{ title: 'Alpha', seconds: 60 }] });
        await api.play(playlist.id, 0);
        await expect.poll(async () => (await api.player()).state).toBe('playing');
        await new PlaylistScreen(app, playlist.name).open();
        const bannerShown = await watchBanner(page);

        await page.route('**/api/v1/**', route => route.abort('connectionrefused'));
        await sleepAndWake(page);
        // Past the wait for a stream dropped any other time.
        await page.waitForTimeout(3500);
        expect(await bannerShown()).toBe(false);
        await expect(page.getByTestId('connection-banner').getByRole('status')).toHaveText(t('connection.lost'));
    });

    test('a closed player says so until it is back', async ({ app, page, playerUrl }) => {
        test.skip(!!process.env.E2E_PLAYER_URL, 'needs the throwaway player, which E2E_PLAYER_URL replaces');
        test.setTimeout(120_000);
        await app.goto('/');
        const banner = page.getByTestId('connection-banner');
        await expect(banner).toBeHidden();

        const restarted = restartThrowawayPlayer(playerUrl, defaultPluginSettings);
        await expect(banner.getByRole('status')).toHaveText(t('connection.closed'), { timeout: 30_000 });
        await restarted;
        // The retries during the restart may have grown to their cap of 30 s.
        await expect(banner).toBeHidden({ timeout: 35_000 });
    });
});

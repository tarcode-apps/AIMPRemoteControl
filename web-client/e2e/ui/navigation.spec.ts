import type { TestPlaylist } from '../fixtures';
import { expect, test } from './fixtures';
import { PlaylistScreen } from './pages/playlist-screen';
import { t } from './strings';

// The browser's back, which a mobile's back gesture is: it closes what is open
// over a screen first, then walks second screen → main screen → player, as AIMP
// for Android does.
test.describe('navigation', () => {
    let playlist: TestPlaylist;
    let screen: PlaylistScreen;

    test.beforeEach(async ({ app, playlists }) => {
        playlist = await playlists.create({ tracks: [{ title: 'Alpha' }, { title: 'Bravo' }] });
        screen = new PlaylistScreen(app, playlist.name);
        await screen.open();
    });

    test('back leaves a second screen for the main one, then for the player', async ({ app, page, player }) => {
        await app.openScreen(t('screens.queue'), t('queue.title'));
        await page.goBack();
        await expect(screen.row('Alpha')).toBeInViewport();
        if (app.playerDocked) return;
        await page.goBack();
        await expect(player.full).toBeInViewport({ ratio: 0.9 });
    });

    test('back closes a search, then a selection, before leaving the screen', async ({ app, page }) => {
        await screen.search('brav');
        await expect(screen.row('Alpha')).toBeHidden();
        await page.goBack();
        await expect(screen.row('Alpha')).toBeVisible();

        await screen.startSelecting();
        await page.goBack();
        await expect(screen.toolbarButton(t('playlist.select'))).toBeVisible();
        await expect(screen.row('Alpha')).toBeInViewport();
        await expect(app.heading.or(screen.tab)).toBeVisible();
    });

    test('back closes the drawer', async ({ app, page }) => {
        test.skip(app.drawerDocked, 'a docked drawer does not close');
        await app.openDrawer();
        await page.goBack();
        await expect(app.navigation).toBeHidden();
        await expect(screen.row('Alpha')).toBeInViewport();
    });

    test('a second screen opened by its address keeps its place on reload, and back leads home', async ({
        app,
        page,
    }) => {
        await app.goto('/timer/');
        await page.reload();
        await expect(app.heading).toHaveText(t('screens.timer'));
        if (app.drawerDocked) await page.goBack();
        else await app.backButton.click();
        // Home is the main screen, on whichever playlist the player has selected.
        await expect(app.main.getByRole('listbox').first()).toBeVisible();
        await expect(page).toHaveURL(/\/$/);
    });
});

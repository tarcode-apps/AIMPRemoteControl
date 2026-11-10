import type { Page } from '@playwright/test';
import type { TestPlaylist } from '../fixtures';
import { expect, test } from './fixtures';
import { PlaylistScreen } from './pages/playlist-screen';
import { t } from './strings';

// The browser's back, which a mobile's back gesture is: it closes what is open
// over a screen first, then walks second screen → main screen → player, as AIMP
// for Android does. Then the keyboard's way around: the drawer, the search and
// the screen they open.
test.describe('navigation', () => {
    let playlist: TestPlaylist;
    let screen: PlaylistScreen;
    const focusInDrawer = (page: Page) =>
        page.evaluate(() => document.activeElement?.closest('[data-testid="drawer"]') !== null);

    test.beforeEach(async ({ app, playlists }) => {
        playlist = await playlists.create({ tracks: [{ title: 'Alpha' }, { title: 'Bravo' }, { title: 'Charlie' }] });
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
        // Opened by its address, the screen first gets the player put under it: the
        // history is settled once the address is back.
        await expect(app.heading).toHaveText(t('screens.timer'));
        await expect(page).toHaveURL(/\/timer\/$/);
        await page.reload();
        await expect(app.heading).toHaveText(t('screens.timer'));
        if (app.drawerDocked) await page.goBack();
        else await app.backButton.click();
        // Home is the main screen, on whichever playlist the player has selected.
        await expect(app.main.getByRole('listbox').first()).toBeVisible();
        await expect(page).toHaveURL(/\/$/);
    });

    test('the playlists are one stop of the Tab key, which the arrows walk', async ({ app, page }) => {
        test.skip(app.touch, 'a mobile has no keyboard');
        // From the last control above the list, the selected playlist takes the stop;
        // the next Tab leaves the drawer.
        await app.drawer.getByRole('button', { name: t('playlists.create') }).focus();
        await page.keyboard.press('Tab');
        await expect(app.playlistLink(playlist.name)).toBeFocused();
        await page.keyboard.press('Tab');
        expect(await focusInDrawer(page)).toBe(false);
        // The row last walked to keeps the stop.
        await page.keyboard.press('Shift+Tab');
        await expect(app.playlistLink(playlist.name)).toBeFocused();
        await page.keyboard.press('ArrowUp');
        await expect(app.playlistLink('Default')).toBeFocused();
        await page.keyboard.press('Tab');
        expect(await focusInDrawer(page)).toBe(false);
        await page.keyboard.press('Shift+Tab');
        await expect(app.playlistLink('Default')).toBeFocused();
    });

    test('Enter in the drawer puts the focus into the screen it opens', async ({ app, page }) => {
        test.skip(app.touch, 'a mobile has no keyboard');
        // A playlist by its link, and by the search.
        await app.playlistLink('Default').focus();
        await page.keyboard.press('Enter');
        await expect(app.main.getByRole('listbox', { name: 'Default' })).toBeFocused();
        const search = app.drawer.getByPlaceholder(t('playlists.searchPlaceholder'));
        await search.fill(playlist.name);
        await search.press('Enter');
        await expect(screen.list).toBeFocused();
        // A screen of the tools.
        await app.navigationLink(t('screens.queue')).focus();
        await page.keyboard.press('Enter');
        await expect(app.listScreen(t('screens.queue')).list).toBeFocused();
        // One without a list takes the focus itself.
        await app.navigationLink(t('screens.timer')).focus();
        await page.keyboard.press('Enter');
        await expect(app.heading).toHaveText(t('screens.timer'));
        expect(await focusInDrawer(page)).toBe(false);
    });

    test('the slash puts the focus in the search, Ctrl+K in the playlists, and Escape brings it back', async ({
        api,
        app,
        page,
    }) => {
        test.skip(app.touch, 'a mobile has no keyboard');
        // The cursor on Bravo, whose position the search gives to Charlie, is no
        // cursor in the search: Enter plays the first match. The search looks at the
        // folder's name too, which is the test's, so the word is one it lacks.
        await screen.row('Bravo').click();
        await page.keyboard.press('/');
        await expect(screen.searchField).toBeFocused();
        await page.keyboard.type('ha');
        await expect(screen.row('Bravo')).toBeHidden();
        await expect(screen.row('Charlie')).toBeVisible();
        // Enter plays the first match and leaves the focus in the field; the arrows
        // walk into the list, past the group's header.
        await page.keyboard.press('Enter');
        await expect.poll(async () => (await api.player()).track?.index).toBe(0);
        await expect(screen.searchField).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(screen.list).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(screen.row('Alpha')).toHaveAttribute('aria-selected', 'true');
        await page.keyboard.press('/');
        await expect(screen.searchField).toBeFocused();
        // Ctrl+K works from a field too, and Escape leads back to that field.
        await page.keyboard.press('Control+k');
        await expect(app.drawer.getByPlaceholder(t('playlists.searchPlaceholder'))).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(screen.searchField).toBeFocused();
        // Escape clears the text first, then leaves the field for where the focus was.
        await page.keyboard.press('Escape');
        await expect(screen.row('Bravo')).toBeVisible();
        await expect(screen.searchField).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(screen.list).toBeFocused();

        await page.keyboard.press('Control+k');
        await expect(app.drawer.getByPlaceholder(t('playlists.searchPlaceholder'))).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(screen.list).toBeFocused();

        // A screen without a search leaves the slash alone.
        await app.goto('/timer/');
        await expect(app.heading).toHaveText(t('screens.timer'));
        await page.keyboard.press('/');
        await expect(page.locator('input:focus')).toHaveCount(0);
    });
});

import type { TestPlaylist } from '../fixtures';
import { expect, test } from './fixtures';
import type { App } from './pages/app';
import { ListScreen } from './pages/list-screen';
import { PlaylistScreen } from './pages/playlist-screen';
import { t, withBadge } from './strings';

// Favorites live in the browser, so every test starts without any.
test.describe('favorites', () => {
    let playlist: TestPlaylist;
    let screen: PlaylistScreen;

    const openFavorites = async (app: App) => {
        await app.openScreen(t('screens.favorites'));
        return new ListScreen(app, app.main.getByRole('listbox', { name: t('screens.favorites') }));
    };

    test.beforeEach(async ({ app, playlists }) => {
        playlist = await playlists.create({
            tracks: [
                { title: 'Alpha', seconds: 60 },
                { title: 'Bravo', seconds: 60 },
            ],
        });
        screen = new PlaylistScreen(app, playlist.name);
        await screen.open();
        await screen.rowAction('Bravo', t('favorites.add'));
    });

    test('a track added from its playlist is listed under it and plays from there', async ({ api, app }) => {
        const favorites = await openFavorites(app);
        await expect(favorites.row('Bravo')).toBeVisible();
        await expect(favorites.groupButton(playlist.name)).toBeVisible();
        await expect(app.navigationLink(t('screens.favorites'))).toHaveAccessibleName(
            withBadge(t('screens.favorites'), 1),
        );

        await favorites.play('Bravo');
        await expect.poll(async () => (await api.player()).track?.index).toBe(1);
        expect((await api.player()).track?.playlistId).toBe(playlist.id);
    });

    test('a track removed from its playlist stays, dimmed', async ({ api, app }) => {
        await api.post(`/playlists/${encodeURIComponent(playlist.id)}/items/remove`, { indexes: [1] });
        const favorites = await openFavorites(app);
        await expect(favorites.row('Bravo')).toHaveAttribute('title', t('favorites.missing'));
        // Nothing is known about it beyond its name: its menu offers to find it, not to describe it.
        await favorites
            .row('Bravo')
            .getByRole('button', { name: t('playlist.itemActions') })
            .click();
        await expect(app.menuItem(t('favorites.find'))).toBeVisible();
        await expect(app.menuItem(t('trackInfo.open'))).toBeHidden();
    });

    test('a favorite is removed from its menu, and Clear removes them all', async ({ app }) => {
        await screen.rowAction('Alpha', t('favorites.add'));
        // The menu of a favorite offers to take it back.
        await screen.rowAction('Alpha', t('favorites.remove'));
        await screen.rowAction('Alpha', t('favorites.add'));

        const favorites = await openFavorites(app);
        await expect(favorites.rows).toHaveCount(2);
        await favorites.rowAction('Bravo', t('favorites.remove'));
        await expect(favorites.row('Bravo')).toBeHidden();
        await expect(favorites.row('Alpha')).toBeVisible();

        await favorites.more(t('favorites.clear'));
        await expect(favorites.list.getByText(t('favorites.empty'))).toBeVisible();
    });
});

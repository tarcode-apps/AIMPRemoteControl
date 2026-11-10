import type { TestPlaylist } from '../fixtures';
import { expect, test } from './fixtures';
import { PlaylistScreen } from './pages/playlist-screen';
import { t } from './strings';

test.describe('the Delete key', () => {
    let playlist: TestPlaylist;
    let screen: PlaylistScreen;

    test.beforeEach(async ({ app, playlists }) => {
        test.skip(app.touch, 'a touch screen has no Delete key');
        playlist = await playlists.create({ tracks: [{ title: 'Alpha' }, { title: 'Bravo' }, { title: 'Charlie' }] });
        screen = new PlaylistScreen(app, playlist.name);
        await screen.open();
    });

    test('takes the row under the cursor, or the selection, out of the playlist', async ({ api, page }) => {
        await screen.row('Alpha').click();
        await page.keyboard.press('Delete');
        await expect(screen.row('Alpha')).toBeHidden();
        await expect.poll(() => api.playlistItemCount(playlist.id)).toBe(2);

        // With the checkboxes shown it is the selection's, as the toolbar's item: with
        // nothing selected the row under the cursor is left alone.
        await screen.startSelecting();
        await screen.row('Bravo').click();
        await screen.row('Bravo').click();
        await page.keyboard.press('Delete');
        await expect(screen.row('Bravo')).toBeVisible();
        await screen.checkbox('Charlie').click();
        await page.keyboard.press('Delete');
        await expect(screen.row('Charlie')).toBeHidden();
        await expect(screen.row('Bravo')).toBeVisible();
        await expect.poll(() => api.playlistItemCount(playlist.id)).toBe(1);
    });

    test('takes a favorite out of the favorites, leaving the playlist alone', async ({ api, app, page }) => {
        await screen.rowAction('Alpha', t('favorites.add'));
        await screen.rowAction('Bravo', t('favorites.add'));
        const favorites = await app.openListScreen(t('screens.favorites'));
        await favorites.row('Alpha').click();
        await page.keyboard.press('Delete');
        await expect(favorites.row('Alpha')).toBeHidden();
        await expect(favorites.row('Bravo')).toBeVisible();
        expect(await api.playlistItemCount(playlist.id)).toBe(3);
    });

    test('takes the row under the cursor out of the playlist from the extended search', async ({ api, app, page }) => {
        await screen.more(t('search.title'));
        const search = app.listScreen(t('search.title'));
        await search.search('alpha');
        await search.row('Alpha').click();
        await page.keyboard.press('Delete');
        await expect.poll(() => api.playlistItemCount(playlist.id)).toBe(2);
        await expect(search.row('Alpha')).toBeHidden();
    });

    test('asks to remove the playlist focused in the drawer', async ({ api, app, page }) => {
        await app.openDrawer();
        await app.playlistLink(playlist.name).focus();
        await page.keyboard.press('Delete');
        await expect(app.dialog).toContainText(t('playlists.removeConfirm', { name: playlist.name }));
        await app.dialogButton(t('actions.delete')).click();
        await expect.poll(async () => (await api.playlists()).some(p => p.id === playlist.id)).toBe(false);
    });

    test('takes the row under the cursor out of the queue', async ({ api, app, page }) => {
        await api.enqueue(playlist.id, [0, 1, 2]);
        await app.goto('/queue/');
        const queue = app.listScreen(t('screens.queue'));
        await queue.row('Bravo').click();
        await page.keyboard.press('Delete');
        await expect.poll(async () => (await api.queue()).items.map(item => item.index)).toEqual([0, 2]);
        await expect(queue.row('Bravo')).toBeHidden();
    });
});

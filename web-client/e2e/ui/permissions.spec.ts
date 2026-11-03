import { expect, test, withPluginSettings } from './fixtures';
import { PlaylistScreen } from './pages/playlist-screen';
import { t } from './strings';

// What the client offers when the plugin's settings allow nothing optional.
test.describe('with every permission off', () => {
    withPluginSettings({ physicalDeletion: false, uploadTracks: false, scheduler: false, browseFiles: false });

    test('the Add menu offers a URL only, and the track menu no deletion from disk', async ({
        api,
        app,
        playlists,
    }) => {
        // Files cannot be added by path now; a stream can.
        const playlist = await playlists.create();
        await api.post(`/playlists/${encodeURIComponent(playlist.id)}/items`, { urls: ['http://127.0.0.1:9/radio'] });
        await expect.poll(() => api.playlistItemCount(playlist.id)).toBe(1);
        const screen = new PlaylistScreen(app, playlist.name);
        await screen.open();

        await screen.toolbarButton(t('playlist.add')).click();
        await expect(app.menuItem(t('playlist.addUrl'))).toBeVisible();
        await expect(app.menuItem(t('playlist.addFiles'))).toHaveCount(0);
        await expect(app.menuItem(t('playlist.addPlaylistFile'))).toHaveCount(0);
        await expect(app.menuItem(t('playlist.upload'))).toHaveCount(0);
        await app.page.keyboard.press('Escape');

        await screen
            .row('radio')
            .getByRole('button', { name: t('playlist.itemActions') })
            .click();
        await expect(app.menuItem(t('playlist.removeFromPlaylist'))).toBeVisible();
        await expect(app.menuItem(t('playlist.deleteFromDisk'))).toHaveCount(0);
    });

    test('the timer says it is disabled', async ({ app }) => {
        await app.goto('/timer/');
        await expect(app.main.getByText(t('timer.disabled'))).toBeVisible();
        await expect(app.main.getByRole('button', { name: t('timer.start') })).toHaveCount(0);
    });
});

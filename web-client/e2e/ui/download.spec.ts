import fs from 'node:fs';
import { expect, test } from './fixtures';
import { ListScreen } from './pages/list-screen';
import { PlaylistScreen } from './pages/playlist-screen';
import { t } from './strings';

test.describe('downloading tracks', () => {
    test('a row menu saves the file under its own name, and says why a gone file is not saved', async ({
        api,
        app,
        playlists,
    }) => {
        const name = 'Трек один.wav';
        const playlist = await playlists.create({ tracks: [{ title: 'Saved', name }, { title: 'Missing' }] });
        const screen = new PlaylistScreen(app, playlist.name);
        await screen.open();

        // The last item, after the deletion from disk.
        await screen
            .row('Saved')
            .getByRole('button', { name: t('playlist.itemActions') })
            .click();
        const items = app.page.getByRole('menuitem');
        await expect(items.nth(-2)).toHaveAccessibleName(t('playlist.deleteFromDisk'));
        await expect(items.last()).toHaveAccessibleName(t('playlist.download'));
        const saved = app.page.waitForEvent('download');
        await items.last().click();
        const download = await saved;
        expect(download.suggestedFilename()).toBe(name);
        expect(fs.readFileSync(await download.path()).equals(fs.readFileSync(playlist.files[0]))).toBe(true);

        fs.rmSync(playlist.files[1]);
        const route = `/playlists/${encodeURIComponent(playlist.id)}/items/file?uri=${encodeURIComponent(playlist.files[1])}`;
        const reason = (await api.get(route)).error!.message;
        await screen.rowAction('Missing', t('playlist.download'));
        await expect(app.dialog).toContainText(reason);
        await app.dialogButton(t('actions.ok')).click();
        await expect(app.dialog).toBeHidden();
    });

    test("the player's track menu saves the playing track", async ({ api, app, player, playlists }) => {
        const playlist = await playlists.create({ tracks: [{ title: 'Playing', seconds: 60 }] });
        await api.play(playlist.id, 0);
        await app.goto('/');
        await expect(player.title).toHaveText('Playing');

        const saved = app.page.waitForEvent('download');
        await player.chooseFromTrackMenu(t('playlist.download'));
        expect((await saved).suggestedFilename()).toBe('track-01.wav');
    });

    test("a favorite's menu saves its file", async ({ app, playlists }) => {
        const playlist = await playlists.create({ tracks: [{ title: 'Liked', name: 'liked.wav' }] });
        const screen = new PlaylistScreen(app, playlist.name);
        await screen.open();
        await screen.rowAction('Liked', t('favorites.add'));
        await app.openScreen(t('screens.favorites'));
        const favorites = new ListScreen(app, app.main.getByRole('listbox', { name: t('screens.favorites') }));

        const saved = app.page.waitForEvent('download');
        await favorites.rowAction('Liked', t('playlist.download'));
        expect((await saved).suggestedFilename()).toBe('liked.wav');
    });
});

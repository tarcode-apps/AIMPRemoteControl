import { expect, test, withPluginSettings } from './fixtures';
import { t } from './strings';

const credentials = { username: 'rc-e2e', password: 'secret word' };

// The browser answers the player's Digest challenges itself, and counts the
// requests it signs; the client must work through it, its event stream included.
test.describe('behind authentication', () => {
    withPluginSettings({ auth: credentials });
    test.use({ httpCredentials: credentials });

    test('a playlist made and removed in the client comes and goes through the event stream', async ({
        app,
        player,
    }) => {
        const name = `rc-e2e behind a login ${test.info().project.name}`;
        await app.goto('/');
        // A mobile starts on the expanded player.
        if (!app.playerDocked) await player.collapse();
        await app.openDrawer();
        await app.navigation.getByRole('button', { name: t('playlists.create') }).click();
        await app.dialog.getByRole('textbox').fill(name);
        await app.dialogButton(t('actions.ok')).click();
        await expect(app.dialog).toBeHidden();

        await app.openDrawer();
        await expect(app.playlistLink(name)).toBeVisible();
        await app.chooseFromMenu(app.playlistMenuButton(name), t('playlists.remove'));
        await app.dialogButton(t('actions.delete')).click();
        await expect(app.playlistLink(name)).toHaveCount(0);
    });
});

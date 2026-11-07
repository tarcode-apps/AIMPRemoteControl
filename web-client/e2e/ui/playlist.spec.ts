import fs from 'node:fs';
import type { TestPlaylist } from '../fixtures';
import { expect, test, withPluginSettings } from './fixtures';
import { PlaylistScreen } from './pages/playlist-screen';
import { t } from './strings';

test.describe('playlist', () => {
    let playlist: TestPlaylist;
    let screen: PlaylistScreen;

    test.beforeEach(async ({ app, playlists }) => {
        playlist = await playlists.create({
            tracks: [
                { title: 'Alpha', seconds: 30, folder: 'first' },
                { title: 'Bravo', seconds: 10, folder: 'first' },
                { title: 'Charlie', seconds: 20, folder: 'second' },
            ],
        });
        screen = new PlaylistScreen(app, playlist.name);
        await screen.open();
    });

    test('lists the tracks in their groups, and a header folds its group', async ({ api }) => {
        await expect(screen.row('Alpha')).toBeVisible();
        await expect(screen.row('Bravo')).toBeVisible();
        await expect(screen.row('Charlie')).toBeVisible();

        await screen.groupButton('second').click();
        await expect(screen.row('Charlie')).toBeHidden();
        await expect.poll(async () => (await api.groups(playlist.id)).groups[1].expanded).toBe(false);
        await screen.groupButton('second').click();
        await expect(screen.row('Charlie')).toBeVisible();
    });

    test('plays a track by a tap or a double click', async ({ api, app }) => {
        if (!app.touch) {
            // A single click only puts the cursor on the row.
            await screen.row('Bravo').click();
            await expect(screen.row('Bravo')).toHaveAttribute('aria-selected', 'true');
            expect((await api.player()).state).toBe('stopped');
        }
        await screen.play('Bravo');
        await expect.poll(async () => (await api.player()).track?.index).toBe(1);
        expect((await api.player()).track?.playlistId).toBe(playlist.id);
    });

    test('the keyboard walks the list and Enter plays', async ({ api, app }) => {
        test.skip(app.touch, 'a mobile has no keyboard');
        await screen.row('Alpha').click();
        await screen.list.press('ArrowDown');
        await expect(screen.row('Bravo')).toHaveAttribute('aria-selected', 'true');
        await screen.list.press('Enter');
        await expect.poll(async () => (await api.player()).track?.index).toBe(1);
    });

    test('a search narrows the list, and closing it brings everything back', async ({ api }) => {
        await screen.search('brav');
        await expect(screen.row('Bravo')).toBeVisible();
        await expect(screen.row('Alpha')).toBeHidden();
        // Anything found plays at once, even by mouse.
        await screen.row('Bravo').click();
        await expect.poll(async () => (await api.player()).track?.index).toBe(1);

        await screen.search('nothing like it');
        await expect(screen.list.getByText(t('playlist.noResults'))).toBeVisible();
        await screen.closeSearch();
        await expect(screen.row('Alpha')).toBeVisible();
        await expect(screen.row('Charlie')).toBeVisible();
    });

    test('selected tracks go to the queue, or out of the playlist', async ({ api }) => {
        await screen.startSelecting();
        await screen.row('Alpha').click();
        await screen.row('Charlie').click();
        await expect(screen.checkbox('Alpha')).toBeChecked();
        await expect(screen.checkbox('Bravo')).not.toBeChecked();
        await screen.selectedAction(t('playlist.enqueue'));
        await expect.poll(async () => (await api.queue()).items.map(item => item.index)).toEqual([0, 2]);

        await screen.toolbarButton(t('playlist.closeSelection')).click();
        await screen.startSelecting();
        await screen.row('Bravo').click();
        await screen.selectedAction(t('playlist.removeFromPlaylist'));
        await expect(screen.row('Bravo')).toBeHidden();
        expect(await api.playlistItemCount(playlist.id)).toBe(2);
        expect(fs.existsSync(playlist.files[1])).toBe(true);
    });

    test('a track goes from disk only after the question is answered', async ({ api, app }) => {
        await screen.rowAction('Bravo', t('playlist.deleteFromDisk'));
        await expect(app.dialog).toContainText(t('playlist.deleteFromDiskConfirm', { name: 'Test Artist - Bravo' }));
        await app.dialogButton(t('actions.cancel')).click();
        await expect(app.dialog).toBeHidden();
        expect(fs.existsSync(playlist.files[1])).toBe(true);

        await screen.rowAction('Bravo', t('playlist.deleteFromDisk'));
        await app.dialogButton(t('actions.delete')).click();
        await expect(screen.row('Bravo')).toBeHidden();
        await expect.poll(() => fs.existsSync(playlist.files[1])).toBe(false);
        expect(await api.playlistItemCount(playlist.id)).toBe(2);
    });

    test('the track menu queues a track first', async ({ api }) => {
        await screen.rowAction('Charlie', t('playlist.enqueue'));
        await screen.rowAction('Alpha', t('playlist.enqueueFirst'));
        await expect.poll(async () => (await api.queue()).items.map(item => item.index)).toEqual([0, 2]);
        await expect(screen.row('Charlie').getByTitle(t('playlist.inQueue'))).toHaveText('[2]');
    });

    test('a refused action says why in the toast', async ({ app, page }) => {
        const message = 'The queue is busy.';
        await page.route('**/api/v1/queue/items', route =>
            route.fulfill({ status: 500, json: { error: { code: 'enqueueFailed', message } } }),
        );
        await screen.rowAction('Charlie', t('playlist.enqueue'));
        await expect(app.toast).toHaveText(message);
    });

    test('a switch takes a track out of playback', async ({ api, app }) => {
        const enabled = async () => (await api.items(playlist.id)).items.map(item => item.enabled);
        if (app.drawerDocked) {
            await expect(screen.switch('Bravo')).toBeChecked();
            await screen.switch('Bravo').click();
            await expect.poll(enabled).toEqual([true, false, true]);
            await expect(screen.switch('Bravo')).not.toBeChecked();
            // Part of the group on: the group's switch turns all of it on, then off.
            await expect(screen.groupSwitch('first')).toHaveJSProperty('indeterminate', true);
            await screen.groupSwitch('first').click();
            await expect.poll(enabled).toEqual([true, true, true]);
            await expect(screen.groupSwitch('first')).toBeChecked();
            await screen.groupSwitch('first').click();
            await expect.poll(enabled).toEqual([false, false, true]);
            await expect(screen.groupSwitch('first')).not.toBeChecked();
        } else {
            await screen.rowAction('Bravo', t('playlist.disable'));
            await expect(screen.row('Bravo')).toHaveAttribute('data-enabled', 'false');
            await expect(screen.row('Bravo').getByTitle(t('playlist.switchedOff'))).toBeVisible();
            await expect.poll(enabled).toEqual([true, false, true]);
            await screen.rowAction('Bravo', t('playlist.enable'));
            await expect(screen.row('Bravo')).toHaveAttribute('data-enabled', 'true');
            await expect(screen.row('Bravo').getByTitle(t('playlist.switchedOff'))).toHaveCount(0);
            await expect.poll(enabled).toEqual([true, true, true]);
        }

        await screen.startSelecting();
        await screen.row('Alpha').click();
        await screen.row('Charlie').click();
        await screen.selectedAction(t('playlist.disableSelected'));
        await expect.poll(enabled).toEqual(app.drawerDocked ? [false, false, false] : [false, true, false]);
        await expect(screen.row('Charlie')).toHaveAttribute('data-enabled', 'false');
    });

    test('the group menu folds, queues, switches and removes the group', async ({ api, app }) => {
        await screen.groupAction('second', t('playlist.collapseGroup'));
        await expect(screen.row('Charlie')).toBeHidden();
        await screen.groupAction('first', t('playlist.expandAll'));
        await expect(screen.row('Charlie')).toBeVisible();

        await screen.groupAction('first', t('playlist.enqueue'));
        await expect.poll(async () => (await api.queue()).items.map(item => item.index)).toEqual([0, 1]);

        if (!app.drawerDocked) {
            await screen.groupAction('first', t('playlist.disable'));
            await expect
                .poll(async () => (await api.items(playlist.id)).items.map(item => item.enabled))
                .toEqual([false, false, true]);
        }

        await screen.groupAction('second', t('playlist.removeFromPlaylist'));
        await expect(screen.row('Charlie')).toBeHidden();
        expect(await api.playlistItemCount(playlist.id)).toBe(2);
    });

    test('sorts by a mode chosen in the dialog', async ({ api, app }) => {
        await screen.toolbarButton(t('playlist.sort')).click();
        await screen.toolbarButton(t('playlist.sortBy')).click();
        await app.dialog.getByRole('radio', { name: t('playlist.sortModes.duration'), exact: true }).check();
        await app.dialog.getByRole('checkbox', { name: t('playlist.descending') }).check();
        await app.dialogButton(t('actions.ok')).click();
        await expect(app.dialog).toBeHidden();
        await expect
            .poll(async () => (await api.items(playlist.id)).items.map(item => item.fileUri))
            .toEqual([playlist.files[0], playlist.files[2], playlist.files[1]]);
        await screen.toolbarButton(t('playlist.closeSort')).click();
        await expect(screen.toolbarButton(t('playlist.sort'))).toBeVisible();
    });
});

// With the column hidden the player plays every track, so the client shows
// nothing of the switches.
test.describe('without the switch column', () => {
    withPluginSettings({}, { switchesColumn: false });

    test('no switch, no dimming, no menu item', async ({ api, app, playlists }) => {
        const playlist = await playlists.create({ tracks: 2 });
        expect((await api.playlist(playlist.id))!.showSwitches).toBe(false);
        const screen = new PlaylistScreen(app, playlist.name);
        await screen.open();
        await expect(screen.rows).toHaveCount(2);
        await expect(screen.list.getByTestId('item-switch')).toHaveCount(0);
        await expect(screen.list.getByTestId('group-switch')).toHaveCount(0);
        await expect(screen.rows.first()).not.toHaveAttribute('data-enabled');

        await screen.rows
            .first()
            .getByRole('button', { name: t('playlist.itemActions') })
            .click();
        await expect(app.menuItem(t('playlist.enqueue'))).toBeVisible();
        await expect(app.menuItem(t('playlist.disable'))).toHaveCount(0);
        await app.page.keyboard.press('Escape');

        await screen.startSelecting();
        await screen.toolbarButton(t('playlist.selectedActions')).click();
        await expect(app.menuItem(t('playlist.enqueue'))).toBeVisible();
        await expect(app.menuItem(t('playlist.disableSelected'))).toHaveCount(0);
    });
});

import fs from 'node:fs';
import type { TestPlaylist } from '../fixtures';
import { expect, test } from './fixtures';
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

import type { TestPlaylist } from '../fixtures';
import { expect, test } from './fixtures';
import type { ListScreen } from './pages/list-screen';
import { t, withBadge } from './strings';

test.describe('queue', () => {
    let playlist: TestPlaylist;
    let queue: ListScreen;

    test.beforeEach(async ({ api, app, playlists }) => {
        playlist = await playlists.create({ tracks: [{ title: 'Alpha' }, { title: 'Bravo' }, { title: 'Charlie' }] });
        await api.enqueue(playlist.id, [2]);
        await api.enqueue(playlist.id, [0]);
        queue = app.listScreen(t('screens.queue'));
        await app.goto('/queue/');
        await expect(app.heading).toHaveText(t('queue.title'));
    });

    test('lists the queued tracks in their order, and the drawer counts them', async ({ app }) => {
        await expect(queue.rows).toHaveCount(2);
        await expect(queue.rows.nth(0)).toContainText('Charlie');
        await expect(queue.rows.nth(1)).toContainText('Alpha');
        // A mobile reaches the drawer from the main screen.
        if (!app.drawerDocked) await app.backButton.click();
        await app.openDrawer();
        await expect(app.navigationLink(t('screens.queue'))).toHaveAccessibleName(withBadge(t('screens.queue'), 2));
    });

    test('a track leaves the queue from its menu, and nothing plays from here', async ({ api }) => {
        await queue.rowAction('Charlie', t('queue.remove'));
        await expect(queue.row('Charlie')).toBeHidden();
        await expect.poll(async () => (await api.queue()).items.map(item => item.index)).toEqual([0]);

        await queue.play('Alpha');
        await expect(queue.row('Alpha')).toBeVisible();
        expect((await api.player()).state).toBe('stopped');
    });

    test('the queue is suspended and resumed', async ({ api, app }) => {
        await queue.more(t('queue.suspend'));
        await expect(app.notice).toContainText(t('queue.suspended'));
        await expect.poll(async () => (await api.queue()).suspended).toBe(true);

        await app.notice.getByRole('button', { name: t('queue.resumeShort') }).click();
        await expect(app.notice).toBeHidden();
        await expect.poll(async () => (await api.queue()).suspended).toBe(false);
    });

    test('selected tracks leave together, and Clear empties the queue', async ({ api }) => {
        await queue.startSelecting();
        await queue.row('Alpha').click();
        await queue.selectedAction(t('queue.remove'));
        await expect.poll(async () => (await api.queue()).items.map(item => item.index)).toEqual([2]);

        // The selection goes with the tracks, the mode stays.
        await expect(queue.checkbox('Charlie')).not.toBeChecked();
        await queue.toolbarButton(t('playlist.closeSelection')).click();
        await queue.more(t('queue.clear'));
        await expect(queue.list.getByText(t('queue.empty'))).toBeVisible();
        expect((await api.queue()).items).toEqual([]);
    });
});

import type { TestPlaylist } from '../fixtures';
import { expect, test } from './fixtures';
import { ListScreen } from './pages/list-screen';
import { PlaylistScreen } from './pages/playlist-screen';
import { t } from './strings';

// The extended search over every playlist, reached from a playlist's More menu.
test.describe('extended search', () => {
    let first: TestPlaylist;
    let second: TestPlaylist;
    let search: ListScreen;

    test.beforeEach(async ({ app, playlists }) => {
        first = await playlists.create({
            name: 'rc-e2e Gannet',
            tracks: [
                { title: 'Zephyr one', seconds: 60 },
                { title: 'Calm', artist: 'Zephyr Band', seconds: 60 },
            ],
        });
        second = await playlists.create({ name: 'rc-e2e Puffin', tracks: [{ title: 'Zephyr two', seconds: 60 }] });
        const screen = new PlaylistScreen(app, first.name);
        await screen.open();
        await screen.more(t('search.title'));
        search = new ListScreen(app, app.main.getByRole('listbox', { name: t('search.title') }));
        await expect(search.list).toBeVisible();
    });

    test('finds tracks in every playlist, grouped by playlist', async () => {
        await expect(search.list.getByText(t('search.prompt'))).toBeVisible();
        await search.search('zephyr');
        await expect(search.groupButton(first.name)).toBeVisible();
        await expect(search.groupButton(second.name)).toBeVisible();
        await expect(search.row('Zephyr one')).toBeVisible();
        await expect(search.row('Zephyr Band')).toBeVisible();
        await expect(search.row('Zephyr two')).toBeVisible();
    });

    test("a group's menu acts on its matches and folds every group", async ({ api }) => {
        await search.search('zephyr');
        // The title and the artist both match in the first playlist.
        await search.groupAction(first.name, t('playlist.enqueue'));
        await expect.poll(async () => (await api.queue()).items.length).toBe(2);

        await search.groupAction(second.name, t('playlist.collapseAll'));
        await expect(search.rows).toHaveCount(0);
        await search.groupAction(first.name, t('playlist.expandAll'));
        await expect(search.rows).toHaveCount(3);
    });

    test('a found track plays, and Go to track shows it in its playlist', async ({ api, app }) => {
        await search.search('zephyr two');
        await search.play('Zephyr two');
        await expect.poll(async () => (await api.player()).track?.playlistId).toBe(second.id);
        await expect(search.row('Zephyr two')).toBeVisible();

        await search.rowAction('Zephyr two', t('playlist.goToTrack'));
        const screen = new PlaylistScreen(app, second.name);
        await expect(screen.row('Zephyr two')).toHaveAttribute('aria-selected', 'true');
    });

    test('the fields and the playlists searched can be narrowed', async ({ app }) => {
        await search.search('zephyr');
        await expect(search.row('Zephyr Band')).toBeVisible();

        await search.more(t('search.fields'));
        await app.dialog.getByRole('checkbox', { name: t('search.field.artist') }).uncheck();
        await app.dialogButton(t('actions.ok')).click();
        await expect(search.row('Zephyr Band')).toBeHidden();
        await expect(search.row('Zephyr one')).toBeVisible();

        await search.toolbarButton(t('search.playlists')).click();
        await app.dialog.getByRole('checkbox', { name: first.name, exact: true }).uncheck();
        await app.dialogButton(t('actions.ok')).click();
        await expect(search.row('Zephyr one')).toBeHidden();
        await expect(search.row('Zephyr two')).toBeVisible();
    });
});

import type { Page } from '@playwright/test';
import type { TestPlaylist } from '../fixtures';
import { expect, test } from './fixtures';
import { PlaylistScreen } from './pages/playlist-screen';
import { t } from './strings';

test.describe('selection by keys', () => {
    let playlist: TestPlaylist;
    let screen: PlaylistScreen;

    test.beforeEach(async ({ app, playlists }) => {
        test.skip(app.touch, 'a touch screen has no modifier keys');
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

    const selecting = () => screen.toolbarButton(t('playlist.closeSelection'));
    const selectedText = (page: Page) => page.evaluate(() => getSelection()?.toString() ?? '');
    const checked = async (...titles: string[]) => {
        for (const title of ['Alpha', 'Bravo', 'Charlie'])
            if (titles.includes(title)) await expect(screen.checkbox(title)).toBeChecked();
            else await expect(screen.checkbox(title)).not.toBeChecked();
    };

    test('Ctrl+A selects everything, entering the selection', async ({ app, page }) => {
        await screen.row('Alpha').click();
        await page.keyboard.press('Control+a');
        await expect(selecting()).toBeVisible();
        await checked('Alpha', 'Bravo', 'Charlie');
        await expect(app.subtitle).toHaveText(/^3 \/ 1:00 \//);
        // Again it keeps everything, unlike the toolbar's button.
        await page.keyboard.press('Control+a');
        await checked('Alpha', 'Bravo', 'Charlie');
    });

    test("Ctrl+A anywhere on the page takes the list, and never the page's text", async ({ app, page }) => {
        await app.heading.click();
        await page.keyboard.press('Control+a');
        await expect(selecting()).toBeVisible();
        await checked('Alpha', 'Bravo', 'Charlie');
        expect(await selectedText(page)).toBe('');
        // The keys go on in the list, from its top: the first group's header, then Alpha.
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Space');
        await checked('Bravo', 'Charlie');
        // A screen without a list swallows the key.
        await app.goto('/timer/');
        await expect(app.heading).toHaveText(t('screens.timer'));
        await page.keyboard.press('Control+a');
        expect(await selectedText(page)).toBe('');
    });

    test('Escape clears the selection first, and leaves any mode next', async ({ page }) => {
        await screen.row('Alpha').click();
        await page.keyboard.press('Control+a');
        await checked('Alpha', 'Bravo', 'Charlie');
        await page.keyboard.press('Escape');
        await checked();
        await expect(selecting()).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(selecting()).toBeHidden();

        // In a search the second Escape closes the search.
        await screen.search('bravo');
        await expect(screen.row('Alpha')).toBeHidden();
        await screen.checkbox('Bravo').click();
        await expect(screen.checkbox('Bravo')).toBeChecked();
        await page.keyboard.press('Escape');
        await expect(screen.checkbox('Bravo')).not.toBeChecked();
        await expect(screen.row('Alpha')).toBeHidden();
        await page.keyboard.press('Escape');
        await expect(screen.row('Alpha')).toBeVisible();

        // The sort leaves the same way, and from the toolbar's button too, where
        // the focus is after it was pressed.
        await screen.toolbarButton(t('playlist.sort')).click();
        await page.keyboard.press('Escape');
        await expect(screen.toolbarButton(t('playlist.closeSort'))).toBeHidden();
        await screen.startSelecting();
        await screen.checkbox('Bravo').click();
        await screen.toolbarButton(t('playlist.selectAll')).click();
        await page.keyboard.press('Escape');
        await checked();
        await expect(selecting()).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(selecting()).toBeHidden();
    });

    test("Ctrl+click picks a row, Shift+click a range the row's way", async ({ app, page }) => {
        await screen.row('Bravo').click({ modifiers: ['Control'] });
        await expect(selecting()).toBeVisible();
        await checked('Bravo');
        // The player sums the selection up.
        await expect(app.subtitle).toHaveText(/^1 \/ 0:10 \//);

        await screen.row('Charlie').click({ modifiers: ['Shift'] });
        await checked('Bravo', 'Charlie');
        await expect(app.subtitle).toHaveText(/^2 \/ 0:30 \//);
        // Back from the anchor: Alpha joins, and no text is selected along the way.
        await screen.row('Alpha').click({ modifiers: ['Shift'] });
        await checked('Alpha', 'Bravo', 'Charlie');
        expect(await selectedText(page)).toBe('');
        // A range to a selected row takes it away.
        await screen.row('Bravo').click({ modifiers: ['Control'] });
        await checked('Alpha', 'Charlie');
        await screen.row('Charlie').click({ modifiers: ['Shift'] });
        await checked('Alpha');
        // A checkbox picks its row at the first click, and the range starts from it.
        await screen.checkbox('Alpha').click();
        await checked();
        await screen.row('Charlie').click({ modifiers: ['Shift'] });
        await checked('Alpha', 'Bravo', 'Charlie');
        // The modifiers work on the checkbox itself, which shows what it did.
        await screen.checkbox('Bravo').click({ modifiers: ['Control'] });
        await checked('Alpha', 'Charlie');
        await screen.checkbox('Alpha').click({ modifiers: ['Shift'] });
        await checked('Charlie');
    });

    test('the totals stand until the player has summed the selection up', async ({ app, page }) => {
        await screen.row('Alpha').click();
        await page.keyboard.press('Control+a');
        await expect(app.subtitle).toHaveText(/^3 \/ 1:00 \//);
        let answer = () => {};
        const held = new Promise<void>(resolve => (answer = resolve));
        await page.route('**/api/v1/items/summary', async route => {
            await held;
            await route.continue();
        });
        await screen.row('Bravo').click({ modifiers: ['Control'] });
        await checked('Alpha', 'Charlie');
        await expect(app.subtitle).toHaveText(/^3 \/ 1:00 \//);
        await page.waitForTimeout(300);
        await expect(app.subtitle).toHaveText(/^3 \/ 1:00 \//);
        answer();
        await expect(app.subtitle).toHaveText(/^2 \/ 0:50 \//);
    });

    test('Shift with the arrows draws a range from the cursor, and back shrinks it', async ({ page }) => {
        await screen.row('Alpha').click();
        await page.keyboard.press('Shift+ArrowDown');
        await expect(selecting()).toBeVisible();
        await checked('Alpha', 'Bravo');
        // On to the header of the second group, which stands for its group.
        await page.keyboard.press('Shift+ArrowDown');
        await checked('Alpha', 'Bravo', 'Charlie');
        await page.keyboard.press('Shift+ArrowUp');
        await checked('Alpha', 'Bravo');
        await page.keyboard.press('Shift+End');
        await checked('Alpha', 'Bravo', 'Charlie');
        // Home is the first group's header, so its group stays whole.
        await page.keyboard.press('Shift+Home');
        await checked('Alpha', 'Bravo');
    });

    test('a row picked with the mouse takes the cursor, which the keys go on from', async ({ page }) => {
        await screen.startSelecting();
        await screen.row('Bravo').click();
        await checked('Bravo');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Space');
        await checked('Bravo', 'Charlie');
        await screen.checkbox('Alpha').click();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Space');
        await checked('Alpha', 'Charlie');
        // So do Ctrl+click and Shift+click.
        await screen.row('Alpha').click({ modifiers: ['Control'] });
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Space');
        await checked('Bravo', 'Charlie');
        await screen.row('Charlie').click({ modifiers: ['Shift'] });
        await checked();
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('Space');
        await checked('Bravo');
    });

    test('Ctrl+click on a group header takes the group, without folding it', async () => {
        await screen.groupRow('second').click({ modifiers: ['Control'] });
        await expect(selecting()).toBeVisible();
        await checked('Charlie');
        await expect(screen.row('Charlie')).toBeVisible();
        await screen.groupRow('first').click({ modifiers: ['Shift'] });
        await checked('Alpha', 'Bravo', 'Charlie');
    });

    test('while sorting, Ctrl+A does nothing', async ({ page }) => {
        await screen.toolbarButton(t('playlist.sort')).click();
        await screen.row('Alpha').click();
        await page.keyboard.press('Control+a');
        await expect(selecting()).toBeHidden();
        await expect(screen.toolbarButton(t('playlist.closeSort'))).toBeVisible();
    });

    test('in the favorites, whose groups the selection does not count, Ctrl+click picks a lone row', async ({
        app,
        playlists,
    }) => {
        // Alpha makes a group of its own: the favorites are grouped by playlist.
        await screen.rowAction('Alpha', t('favorites.add'));
        const other = await playlists.create({ name: 'rc-e2e Other', tracks: [{ title: 'Delta' }] });
        const otherScreen = new PlaylistScreen(app, other.name);
        await otherScreen.open();
        await otherScreen.rowAction('Delta', t('favorites.add'));
        const favorites = await app.openListScreen(t('screens.favorites'));
        await favorites.row('Alpha').click({ modifiers: ['Control'] });
        await expect(favorites.checkbox('Alpha')).toBeChecked();
        await expect(favorites.checkbox('Delta')).not.toBeChecked();
        await favorites.row('Delta').click({ modifiers: ['Control'] });
        await expect(favorites.checkbox('Delta')).toBeChecked();
        await expect(app.subtitle).toHaveText(/^2 \//);
        await favorites.row('Alpha').click({ modifiers: ['Control'] });
        await expect(favorites.checkbox('Alpha')).not.toBeChecked();
        await expect(favorites.checkbox('Delta')).toBeChecked();
    });

    test('in the extended search, Ctrl+A selects the matches of every playlist', async ({
        api,
        app,
        playlists,
        page,
    }) => {
        const other = await playlists.create({ name: 'rc-e2e Other', tracks: [{ title: 'Alpha two', seconds: 5 }] });
        await screen.more(t('search.title'));
        const search = app.listScreen(t('search.title'));
        await search.search('alpha');
        await expect(search.row('Alpha two')).toBeVisible();
        await search.row('Alpha two').click();
        await page.keyboard.press('Control+a');
        await expect(search.checkbox('Alpha two')).toBeChecked();
        await expect(search.checkbox(/^.*Alpha(?! two)/)).toBeChecked();
        await expect(app.subtitle).toHaveText(/^2 \/ 0:35 \//);
        await search.selectedAction(t('playlist.enqueue'));
        await expect
            .poll(async () => (await api.queue()).items.map(item => item.playlistId).sort())
            .toEqual([playlist.id, other.id].sort());
    });
});

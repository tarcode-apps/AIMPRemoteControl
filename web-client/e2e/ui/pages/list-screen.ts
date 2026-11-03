import { expect, type Locator } from '@playwright/test';
import { t } from '../strings';
import type { App } from './app';

// A screen built around a list of tracks — a playlist, the queue, the favorites,
// the extended search — with the toolbar they share: a search, a selection mode
// with its actions menu, and a More menu.
export class ListScreen {
    readonly toolbar: Locator;
    readonly searchField: Locator;

    constructor(
        readonly app: App,
        // The list on screen; a mobile has a list per playlist side by side.
        readonly list: Locator,
    ) {
        this.toolbar = app.main.getByTestId('list-toolbar');
        this.searchField = app.main.getByRole('searchbox');
    }

    // The tracks' rows, without the group headers.
    get rows(): Locator {
        return this.list.getByTestId('item-row');
    }

    // The row of the track whose text contains `text`.
    row(text: string | RegExp): Locator {
        return this.rows.filter({ hasText: text });
    }

    // The header of a group, which folds and unfolds it.
    groupButton(name: string): Locator {
        return this.list.getByTestId('group-row').filter({ hasText: name }).getByRole('button');
    }

    // Scrolls the list to a fraction of its length, as a fling would; the list is
    // its own scroll container.
    async scrollTo(fraction: number) {
        await this.list.evaluate((list, to) => {
            list.scrollTop = to * (list.scrollHeight - list.clientHeight);
        }, fraction);
    }

    async scrollTop(): Promise<number> {
        return this.list.evaluate(list => Math.round(list.scrollTop));
    }

    toolbarButton(name: string): Locator {
        return this.toolbar.getByRole('button', { name, exact: true });
    }

    // Plays a track as a person does: a tap plays at once, a mouse needs a double
    // click, a single one only puts the cursor on the row.
    async play(text: string | RegExp) {
        if (this.app.touch) await this.row(text).tap();
        else await this.row(text).dblclick();
    }

    // The docked toolbar has the field; a mobile opens it from its Search button.
    async search(text: string) {
        if (!this.app.drawerDocked && !(await this.searchField.isVisible()))
            await this.toolbarButton(t('playlist.search')).click();
        await this.searchField.fill(text);
    }

    async closeSearch() {
        if (this.app.drawerDocked) await this.searchField.fill('');
        else await this.toolbarButton(t('playlist.closeSearch')).click();
    }

    async more(item: string) {
        await this.app.chooseFromMenu(this.toolbarButton(t('playlist.more')), item);
    }

    async startSelecting() {
        await this.toolbarButton(t('playlist.select')).click();
        await expect(this.toolbarButton(t('playlist.closeSelection'))).toBeVisible();
    }

    // A row's checkbox, shown while selecting or searching.
    checkbox(text: string | RegExp): Locator {
        return this.row(text).getByRole('checkbox');
    }

    async selectedAction(item: string) {
        await this.app.chooseFromMenu(this.toolbarButton(t('playlist.selectedActions')), item);
    }

    async rowAction(text: string | RegExp, item: string) {
        await this.app.chooseFromMenu(this.row(text).getByRole('button', { name: t('playlist.itemActions') }), item);
    }
}

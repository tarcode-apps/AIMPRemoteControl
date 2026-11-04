import { expect, type Locator } from '@playwright/test';
import type { App } from './app';
import { ListScreen } from './list-screen';
import { PlayerPanel } from './player-panel';

// The main screen: one playlist's tracks, chosen in the drawer when docked and
// by the tabs on a mobile.
export class PlaylistScreen extends ListScreen {
    constructor(
        app: App,
        readonly name: string,
    ) {
        super(app, app.main.getByRole('listbox', { name, exact: true }));
    }

    // Opens the client on this playlist. A mobile starts on the expanded player,
    // as AIMP for Android does, so the sheet is lowered first.
    async open() {
        await this.app.goto('/');
        const player = new PlayerPanel(this.app);
        if (!this.app.playerDocked) await player.collapse();
        await this.show();
    }

    // Switches to this playlist from another one.
    async show() {
        if (this.app.drawerDocked) {
            await this.app.playlistLink(this.name).click();
            await expect(this.app.heading).toHaveText(this.name);
        } else {
            await this.tab.click();
            await expect(this.tab).toHaveAttribute('aria-selected', 'true');
        }
        await expect(this.list).toBeInViewport();
    }

    get tab() {
        return this.app.main.getByRole('tab', { name: this.name, exact: true });
    }

    // The playback switch in a track's row; docked only, a mobile switches from
    // the row's menu.
    switch(text: string | RegExp): Locator {
        return this.row(text).getByTestId('item-switch');
    }

    // The three-state switch of a group's header.
    groupSwitch(name: string): Locator {
        return this.list.getByTestId('group-row').filter({ hasText: name }).getByTestId('group-switch');
    }
}

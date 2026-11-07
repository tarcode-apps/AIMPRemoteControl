import { expect, type Locator, type Page } from '@playwright/test';
import { startsWith, t } from '../strings';

// The widths from which the client docks the drawer and the player beside the
// screen (app/_styles/_breakpoints.scss); below them both slide over it.
const drawerDockedFrom = 900;
const playerDockedFrom = 1200;

// A freshly emulated viewport may still be settling when a page loads, and the
// client lays itself out by its size: anything read of the layout waits for the
// page to have the viewport first.
export async function waitForViewport(page: Page) {
    const viewport = page.viewportSize();
    if (viewport)
        await page.waitForFunction(({ width, height }) => innerWidth === width && innerHeight === height, viewport);
}

// The shell around every screen: the drawer with its navigation and playlists,
// the app bar, menus and dialogs.
export class App {
    readonly main: Locator;
    readonly heading: Locator;
    readonly subtitle: Locator;
    readonly drawer: Locator;
    readonly navigation: Locator;
    readonly dialog: Locator;
    // The strip under the app bar for a state the whole list is in.
    readonly notice: Locator;
    readonly backButton: Locator;
    // The short message at the bottom of the screen, which goes away by itself.
    readonly toast: Locator;

    constructor(
        readonly page: Page,
        // Taps rather than clicks, as on a mobile.
        readonly touch: boolean,
    ) {
        this.main = page.getByRole('main');
        this.heading = this.main.getByRole('heading', { level: 1 });
        this.subtitle = this.main.getByTestId('screen-subtitle');
        this.drawer = page.getByTestId('drawer');
        this.navigation = page.getByRole('navigation', { name: t('nav.main') });
        this.dialog = page.getByRole('dialog');
        this.notice = this.main.getByRole('status');
        this.backButton = this.main.getByRole('button', { name: t('nav.back'), exact: true });
        this.toast = page.getByTestId('toast');
    }

    get width(): number {
        return this.page.viewportSize()!.width;
    }

    // The drawer sits beside the screen rather than sliding over it.
    get drawerDocked(): boolean {
        return this.width >= drawerDockedFrom;
    }

    // The player sits beside the screen rather than in a sheet.
    get playerDocked(): boolean {
        return this.width >= playerDockedFrom;
    }

    async goto(path: string) {
        await this.page.goto(path);
        await waitForViewport(this.page);
    }

    // A modal drawer stays open after a dialog opened from it; closed, it is hidden.
    // It may be on its way out after an action, so its slide is let finish first.
    async openDrawer() {
        if (this.drawerDocked) return;
        await this.drawer.evaluate(drawer => Promise.all(drawer.getAnimations().map(animation => animation.finished)));
        if (!(await this.navigation.isVisible()))
            await this.main.getByRole('button', { name: t('nav.menu'), exact: true }).click();
        await expect(this.navigation).toBeInViewport();
    }

    // A screen of the drawer, by the name of its link, which may carry a badge.
    navigationLink(name: string): Locator {
        return this.navigation.getByRole('link', { name: startsWith(name) });
    }

    // Opens a screen of the drawer; its heading is its link's name unless told.
    async openScreen(name: string, heading = name) {
        await this.openDrawer();
        await this.navigationLink(name).click();
        await expect(this.heading).toHaveText(heading);
    }

    // The playlist's row in the drawer.
    playlistLink(name: string): Locator {
        return this.navigation.getByRole('link', { name, exact: true });
    }

    // The button of the playlist's row in the drawer that opens its menu.
    playlistMenuButton(name: string): Locator {
        return this.navigation
            .getByRole('listitem')
            .filter({ has: this.page.getByRole('link', { name, exact: true }) })
            .getByRole('button', { name: t('playlists.actions') });
    }

    // The item of the menu open now; closed menus are hidden.
    menuItem(name: string): Locator {
        return this.page.getByRole('menuitem', { name, exact: true });
    }

    // Opens the menu behind `button` and picks an item.
    async chooseFromMenu(button: Locator, item: string) {
        await button.click();
        await this.menuItem(item).click();
    }

    dialogButton(name: string): Locator {
        return this.dialog.getByRole('button', { name, exact: true });
    }

    // Files and folders dragged in from outside, as the system hands them to the
    // browser: by path, so that a folder comes with what is in it.
    async dragFiles(paths: string[]) {
        const cdp = await this.page.context().newCDPSession(this.page);
        const data = { items: [], files: paths, dragOperationsMask: 1 };
        let at = { x: 0, y: 0 };
        const send = (type: 'dragEnter' | 'dragOver' | 'drop' | 'dragCancel') =>
            cdp.send('Input.dispatchDragEvent', { type, ...at, data });
        let entered = false;
        return {
            // Over the middle of `target`, or `offsetY` below its top.
            async moveTo(target: Locator, offsetY?: number) {
                const box = (await target.boundingBox())!;
                at = { x: box.x + box.width / 2, y: box.y + (offsetY ?? box.height / 2) };
                if (!entered) await send('dragEnter');
                entered = true;
                // Chrome hands the page a dragover at a new point only with the
                // next one sent.
                await send('dragOver');
                await send('dragOver');
            },
            async drop() {
                await send('drop');
                await cdp.detach();
            },
            async cancel() {
                await send('dragCancel');
                await cdp.detach();
            },
        };
    }
}

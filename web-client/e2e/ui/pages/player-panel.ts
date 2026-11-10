import { expect, type Locator } from '@playwright/test';
import { t } from '../strings';
import type { App } from './app';

// The radio capture button's name while a stream plays, with its state.
export const radioCaptureName = (on: boolean) =>
    `${t('player.radioCapture')} ${t(on ? 'player.stateOn' : 'player.stateOff')}`;

// The player: docked beside the screens on a large screen, otherwise a sheet
// that is either the mini player at the bottom or expanded over everything.
export class PlayerPanel {
    readonly mini: Locator;
    readonly full: Locator;
    readonly title: Locator;
    readonly artist: Locator;
    // The number of the track and how many the playlist has, as "2/3".
    readonly trackPosition: Locator;
    readonly shuffleButton: Locator;
    readonly repeatButton: Locator;
    readonly radioCaptureButton: Locator;
    readonly positionSlider: Locator;
    readonly previousButton: Locator;
    readonly nextButton: Locator;
    readonly favoriteButton: Locator;
    readonly trackMenuButton: Locator;
    // The title lines and the lyrics as pages of the title block, on a screen
    // without room for the lyrics under the cover.
    readonly titlePages: Locator;
    readonly lyrics: Locator;
    readonly lyricsLines: Locator;
    // The current line, the one being sung, marked by an arrow.
    readonly currentLine: Locator;
    readonly noLyrics: Locator;

    constructor(readonly app: App) {
        const { page } = app;
        this.mini = page.getByTestId('mini-player');
        this.full = page.getByTestId('now-playing');
        this.title = this.full.getByRole('heading', { level: 2 });
        this.artist = this.full.getByTestId('track-artist');
        this.trackPosition = this.full.getByTestId('track-position');
        const button = (name: string) => this.full.getByRole('button', { name, exact: true });
        this.shuffleButton = button(t('player.shuffle'));
        this.repeatButton = button(t('player.repeat'));
        // Named by its state while it can be used, plainly while it cannot.
        this.radioCaptureButton = button(t('player.radioCapture'))
            .or(button(radioCaptureName(false)))
            .or(button(radioCaptureName(true)));
        this.positionSlider = this.full.getByRole('slider', { name: t('player.position'), exact: true });
        this.previousButton = button(t('player.holdToSeek', { action: t('player.previous') }));
        this.nextButton = button(t('player.holdToSeek', { action: t('player.next') }));
        this.favoriteButton = this.full
            .getByRole('button', { name: t('favorites.add'), exact: true })
            .or(button(t('favorites.remove')));
        this.trackMenuButton = button(t('player.trackMenu'));
        this.titlePages = this.full.getByRole('group', { name: t('player.lyricsPages') });
        this.lyrics = this.full.getByTestId('lyrics');
        this.lyricsLines = this.full.getByTestId('lyrics-line');
        this.currentLine = this.lyricsLines.and(page.locator('[aria-current="true"]'));
        this.noLyrics = this.full.getByText(t('player.noLyrics'), { exact: true });
    }

    // Whether the lyrics have room under the cover, where the menu shows and hides
    // them; without it they are a page in the title block's place, which the menu
    // or a swipe turns to.
    async lyricsHaveRoom(): Promise<boolean> {
        await expect(this.trackMenuButton).toBeVisible();
        return (await this.titlePages.count()) === 0;
    }

    async showLyrics() {
        await this.trackMenuButton.click();
        await this.app
            .menuItem(t('player.showLyrics'))
            .or(this.app.menuItem(t('player.lyrics')))
            .click();
    }

    async hideLyrics() {
        await this.trackMenuButton.click();
        await this.app
            .menuItem(t('player.hideLyrics'))
            .or(this.app.menuItem(t('player.trackTitle')))
            .click();
    }

    // A swipe across the title block by `dx` pixels; a touch is pointer events too.
    async swipeTitleBlock(dx: number) {
        const box = (await this.titlePages.boundingBox())!;
        const { mouse } = this.app.page;
        const y = box.y + box.height / 2;
        const x = box.x + box.width / 2 - dx / 2;
        await mouse.move(x, y);
        await mouse.down();
        await mouse.move(x + dx / 2, y, { steps: 5 });
        await mouse.move(x + dx, y, { steps: 5 });
        await mouse.up();
    }

    // A press held on a lyrics line, which seeks to it.
    async holdLine(index: number) {
        const box = (await this.lyricsLines.nth(index).boundingBox())!;
        const { mouse } = this.app.page;
        await mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await mouse.down();
        await this.app.page.waitForTimeout(700);
        await mouse.up();
    }

    // Play, or pause while playing: one button on a sheet, which a hold turns
    // into stop; separate buttons when docked.
    playButton(): Locator {
        const name = this.app.playerDocked ? t('player.play') : t('player.holdToStop', { action: t('player.play') });
        return this.full.getByRole('button', { name, exact: true });
    }

    pauseButton(): Locator {
        const name = this.app.playerDocked ? t('player.pause') : t('player.holdToStop', { action: t('player.pause') });
        return this.full.getByRole('button', { name, exact: true });
    }

    async expand() {
        if (this.app.playerDocked) return;
        await this.mini.getByRole('button', { name: t('player.expand') }).click();
        await expect(this.full).toBeInViewport({ ratio: 0.9 });
    }

    async collapse() {
        if (this.app.playerDocked) return;
        await this.full.getByRole('button', { name: t('player.collapse') }).click();
        await expect(this.mini).toBeInViewport();
    }

    async chooseFromTrackMenu(item: string) {
        await this.app.chooseFromMenu(this.trackMenuButton, item);
    }
}

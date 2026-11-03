import { expect, type Locator } from '@playwright/test';
import { t } from '../strings';
import type { App } from './app';

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
    readonly previousButton: Locator;
    readonly nextButton: Locator;
    readonly favoriteButton: Locator;
    readonly trackMenuButton: Locator;

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
        this.previousButton = button(t('player.holdToSeek', { action: t('player.previous') }));
        this.nextButton = button(t('player.holdToSeek', { action: t('player.next') }));
        this.favoriteButton = this.full
            .getByRole('button', { name: t('favorites.add'), exact: true })
            .or(button(t('favorites.remove')));
        this.trackMenuButton = button(t('player.trackMenu'));
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

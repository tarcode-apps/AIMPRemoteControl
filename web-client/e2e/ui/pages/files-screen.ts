import { expect, type Locator } from '@playwright/test';
import { t, textPattern } from '../strings';
import type { App } from './app';

// The browser of the player's files, which adds what is picked to a playlist.
export class FilesScreen {
    // Adds what is picked, or with nothing picked leads back to the playlist.
    readonly addButton: Locator;

    constructor(readonly app: App) {
        this.addButton = app.main
            .getByRole('button', { name: textPattern('files.addSelected') })
            .or(app.main.getByRole('button', { name: t('files.leave'), exact: true }));
    }

    // Where the browser opens next: it starts in the folder last looked at.
    static async startIn(app: App, folder: string) {
        await app.page.addInitScript(path => localStorage.setItem('files.lastPath', JSON.stringify(path)), folder);
    }

    // The checkbox that picks a file.
    file(name: string): Locator {
        return this.app.main.getByTestId('file-row').filter({ hasText: name }).getByRole('checkbox');
    }

    // Opens the folder; a drive at the top level is opened the same way.
    folder(name: string): Locator {
        return this.app.main.getByRole('button', { name, exact: true });
    }

    async expectFolder(path: string) {
        await expect(this.app.subtitle).toHaveText(path);
    }
}

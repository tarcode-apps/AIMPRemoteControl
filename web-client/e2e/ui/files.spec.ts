import fs from 'node:fs';
import path from 'node:path';
import type { TestPlaylist } from '../fixtures';
import { uploadDir } from '../lib/aimp';
import { expect, test } from './fixtures';
import { FilesScreen } from './pages/files-screen';
import { PlaylistScreen } from './pages/playlist-screen';
import { t } from './strings';

// Adding to a playlist from its Add menu.
test.describe('adding tracks', () => {
    let playlist: TestPlaylist;
    let screen: PlaylistScreen;

    test.beforeEach(async ({ app, media, playlists }) => {
        media.track('Alpha', { name: 'a.wav' });
        media.track('Bravo', { name: 'b.wav' });
        media.cue(['Part one', 'Part two'], { folder: '' });
        fs.mkdirSync(path.join(media.dir, 'inner'));
        await FilesScreen.startIn(app, media.dir);
        playlist = await playlists.create();
        screen = new PlaylistScreen(app, playlist.name);
        await screen.open();
    });

    const openAddMenu = (screen: PlaylistScreen, item: string) =>
        screen.app.chooseFromMenu(screen.toolbarButton(t('playlist.add')), item);

    test('files picked in the browser go into the playlist', async ({ api, app, media }) => {
        await openAddMenu(screen, t('playlist.addFiles'));
        const files = new FilesScreen(app);
        await files.expectFolder(media.dir);
        await expect(files.folder('inner')).toBeVisible();
        // Audio only: the CUE sheet is offered among the playlists, its audio here.
        await expect(files.file('album.wav')).toBeVisible();
        await expect(files.file('album.cue')).toHaveCount(0);

        await files.file('a.wav').check();
        await files.file('b.wav').check();
        await expect(files.addButton).toHaveAccessibleName(t('files.addSelected', { count: 2 }));
        await files.addButton.click();
        await expect(screen.row('Alpha')).toBeVisible();
        await expect(screen.row('Bravo')).toBeVisible();
        expect(await api.playlistItemCount(playlist.id)).toBe(2);
    });

    test('a playlist file is expanded into its tracks', async ({ api, app }) => {
        await openAddMenu(screen, t('playlist.addPlaylistFile'));
        const files = new FilesScreen(app);
        await expect(files.file('a.wav')).toHaveCount(0);
        await files.file('album.cue').check();
        await files.addButton.click();
        await expect(screen.row('Part one')).toBeVisible();
        await expect.poll(() => api.playlistItemCount(playlist.id)).toBe(2);
    });

    test('the browser goes up a level and home to the drives', async ({ app, media }) => {
        await openAddMenu(screen, t('playlist.addFiles'));
        const files = new FilesScreen(app);
        await files.folder('inner').click();
        await files.expectFolder(path.join(media.dir, 'inner'));
        await expect(app.main.getByText(t('files.empty'))).toBeVisible();

        await app.main.getByRole('button', { name: t('files.up') }).click();
        await files.expectFolder(media.dir);
        await app.main.getByRole('button', { name: t('files.home') }).click();
        await expect(app.heading).toHaveText(t('files.computer'));
        await expect(files.folder(path.parse(media.dir).root)).toBeVisible();

        // With nothing picked the check button leads back.
        await files.addButton.click();
        await expect(screen.list).toBeInViewport();
    });

    test('a URL without a scheme is added as https', async ({ api, app }) => {
        await openAddMenu(screen, t('playlist.addUrl'));
        const field = app.dialog.getByRole('textbox');
        await expect(app.dialogButton(t('actions.ok'))).toBeDisabled();
        await field.fill('radio.invalid/stream');
        await app.dialogButton(t('actions.ok')).click();
        await expect
            .poll(async () => (await api.items(playlist.id)).items.map(item => item.fileUri))
            .toEqual(['https://radio.invalid/stream']);
    });

    test('a track uploaded from this device is saved on the player and added', async ({ api, app, media }) => {
        const name = `rc-e2e upload ${test.info().project.name}.wav`;
        const source = media.track('Uploaded', { name });
        const chooser = app.page.waitForEvent('filechooser');
        await openAddMenu(screen, t('playlist.upload'));
        await (await chooser).setFiles(source);
        await expect(screen.row('Uploaded')).toBeVisible();
        expect(await api.playlistItemCount(playlist.id)).toBe(1);
        expect(fs.readFileSync(path.join(uploadDir, name)).equals(fs.readFileSync(source))).toBe(true);
    });
});

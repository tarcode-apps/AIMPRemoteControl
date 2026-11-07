import type { CDPSession, Locator } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import type { TestPlaylist } from '../fixtures';
import { uploadDir } from '../lib/aimp';
import type { Api } from '../lib/api';
import { expect, test, withPluginSettings } from './fixtures';
import { FilesScreen } from './pages/files-screen';
import { PlaylistScreen } from './pages/playlist-screen';
import { t } from './strings';

// Uploads slow enough to watch; `undefined` lifts the limit, which does not speed
// up a request already on its way. The session that set a limit is the one to
// lift it.
const throttle = (cdp: CDPSession, bytesPerSecond?: number) =>
    cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: bytesPerSecond ?? -1,
    });

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

    // Every folder entered is an entry of the browser's history, so back walks up.
    test('back goes up a folder at a time, and from the drives back to the playlist', async ({
        app,
        media,
        page,
        player,
    }) => {
        const inner = path.join(media.dir, 'inner');
        const deeper = path.join(inner, 'deeper');
        fs.mkdirSync(deeper);
        await openAddMenu(screen, t('playlist.addFiles'));
        const files = new FilesScreen(app);
        // The folder last looked at, which counts as one step down from the drives.
        await files.expectFolder(media.dir);
        await files.folder('inner').click();
        await files.expectFolder(inner);
        await files.folder('deeper').click();
        await files.expectFolder(deeper);

        await page.goBack();
        await files.expectFolder(inner);
        await page.evaluate(() => {
            history.back();
            history.back();
        });
        await expect(app.heading).toHaveText(t('files.computer'));
        await page.goForward();
        await files.expectFolder(media.dir);
        await files.folder('inner').click();
        await app.main.getByRole('button', { name: t('files.home') }).click();
        await expect(app.heading).toHaveText(t('files.computer'));

        // Never to the player: it does not open over the screens it left.
        await page.goBack();
        await expect(screen.list).toBeInViewport();
        if (!app.playerDocked) await expect(player.mini).toBeInViewport();
    });

    const pick = async (screen: PlaylistScreen, file: string) => {
        const chooser = screen.app.page.waitForEvent('filechooser');
        await openAddMenu(screen, t('playlist.upload'));
        await (await chooser).setFiles(file);
    };

    test('each upload of a playlist has its line, and a cancel takes out its own', async ({ api, app, media }) => {
        const project = test.info().project.name;
        const cancelled = `rc-e2e cancelled ${project}.wav`;
        const queued = `rc-e2e queued ${project}.wav`;
        const network = await app.page.context().newCDPSession(app.page);
        await throttle(network, 64 * 1024);
        await pick(screen, media.track('Cancelled', { name: cancelled, seconds: 60 }));
        const lines = app.notice.getByTestId('upload-job');
        await expect(lines.first()).toContainText(t('upload.progress', { current: 1, total: 1 }));
        await expect(lines.first()).toContainText(cancelled);
        // The next waits for it, on a line of its own.
        await pick(screen, media.track('Queued', { name: queued }));
        await expect(lines).toHaveCount(2);
        await expect(lines.nth(1)).toContainText(t('upload.waiting'));
        await expect(lines.nth(1)).toContainText(queued);

        // Cancelling the one on its way starts the next.
        await lines
            .first()
            .getByRole('button', { name: t('actions.cancel') })
            .click();
        await expect(lines).toHaveCount(1);
        await expect(lines.first()).toContainText(t('upload.progress', { current: 1, total: 1 }));
        await throttle(network);
        await expect(screen.row('Queued')).toBeVisible();
        await expect(app.notice).toBeHidden();
        expect((await api.items(playlist.id)).items.map(item => path.basename(item.fileUri))).toEqual([queued]);
        expect(fs.existsSync(path.join(uploadDir, cancelled))).toBe(false);
    });

    test('another playlist sends at once while one is busy', async ({ api, app, media, playlists }) => {
        const project = test.info().project.name;
        const other = await playlists.create({ name: `rc-e2e other ${project}` });
        const network = await app.page.context().newCDPSession(app.page);
        await throttle(network, 64 * 1024);
        await pick(screen, media.track('Slow', { name: `rc-e2e slow ${project}.wav`, seconds: 60 }));
        await expect(app.notice).toContainText(t('upload.progress', { current: 1, total: 1 }));

        // Switched to without a reload, which would end the upload.
        const otherScreen = new PlaylistScreen(app, other.name);
        await otherScreen.show();
        const quick = `rc-e2e quick ${project}.wav`;
        await pick(otherScreen, media.track('Quick', { name: quick }));
        await expect(app.notice.getByTestId('upload-job')).toContainText(
            t('upload.progress', { current: 1, total: 1 }),
        );
        await expect(otherScreen.row('Quick')).toBeVisible();
        expect((await api.items(other.id)).items.map(item => path.basename(item.fileUri))).toEqual([quick]);

        // The first is still on its way.
        await screen.show();
        await expect(app.notice).toContainText(t('upload.progress', { current: 1, total: 1 }));
        await app.notice.getByRole('button', { name: t('actions.cancel') }).click();
        await expect(app.notice).toBeHidden();
        await throttle(network);
    });
});

// Files and folders dragged in from outside.
test.describe('dropping files', () => {
    // Chrome hands a page no drag events at all while it emulates touch.
    test.beforeEach(({ app }) => test.skip(app.touch, 'no drag events under touch emulation'));
    const project = () => test.info().project.name;
    const fileNames = async (api: Api, playlistId: string) =>
        (await api.allItems(playlistId)).map(item => path.basename(item.fileUri));

    test('files dropped between rows go where the line shows', async ({ api, app, media, playlists }) => {
        const playlist = await playlists.create({ tracks: 3 });
        const [a, b, c] = playlist.files.map(file => path.basename(file));
        const screen = new PlaylistScreen(app, playlist.name);
        await screen.open();
        const dropped = `rc-e2e dropped ${project()}.wav`;
        const drag = await app.dragFiles([media.track('Dropped', { name: dropped })]);
        const line = screen.list.getByTestId('drop-line');
        // Before the first row, the group's header, the line keeps clear of the
        // list's top edge.
        const listTop = (await screen.list.boundingBox())!.y;
        await drag.moveTo(screen.list.getByTestId('group-row'), 2);
        await expect.poll(async () => (await line.boundingBox())?.y).toBeGreaterThanOrEqual(listTop + 4);
        await expect.poll(async () => (await line.boundingBox())!.y).toBeLessThan(listTop + 8);
        // The upper half of a row puts the line above it.
        await drag.moveTo(screen.row('Track 2'), 2);
        // The line alone shows where they go; the frame would cross it.
        await expect(app.main.getByTestId('drop-frame')).toHaveCount(0);
        const rowTop = (await screen.row('Track 2').boundingBox())!.y;
        await expect
            .poll(async () => {
                const box = (await line.boundingBox())!;
                return Math.abs(box.y + box.height / 2 - rowTop);
            })
            .toBeLessThan(2);

        await drag.drop();
        await expect(app.page.getByRole('menu')).toContainText(t('upload.summary', { count: 1, size: '' }).trim());
        await app.menuItem(t('upload.here')).click();
        await expect.poll(() => fileNames(api, playlist.id)).toEqual([a, dropped, b, c]);
    });

    test('in a search the line stands for the match it is next to', async ({ api, app, media, playlists }) => {
        const playlist = await playlists.create({ tracks: 3 });
        const [a, b, c] = playlist.files.map(file => path.basename(file));
        const screen = new PlaylistScreen(app, playlist.name);
        await screen.open();
        await screen.search('Track 2');
        await expect(screen.rows).toHaveCount(1);
        const dropped = `rc-e2e searched ${project()}.wav`;
        const drag = await app.dragFiles([media.track('Searched', { name: dropped })]);
        // The lower half of the only match: right after it in the playlist, not at the end.
        const row = (await screen.row('Track 2').boundingBox())!;
        await drag.moveTo(screen.row('Track 2'), row.height - 2);
        await expect(screen.list.getByTestId('drop-line')).toBeVisible();
        await drag.drop();
        await app.menuItem(t('upload.here')).click();
        await expect.poll(() => fileNames(api, playlist.id)).toEqual([a, b, dropped, c]);
    });

    // The player's revision moves on as the first job's tracks come in; the second
    // goes where it was dropped all the same.
    test('a drop waiting behind another into the playlist still goes where it was dropped', async ({
        api,
        app,
        media,
        playlists,
    }) => {
        const playlist = await playlists.create({ tracks: 2 });
        const [a, b] = playlist.files.map(file => path.basename(file));
        const screen = new PlaylistScreen(app, playlist.name);
        await screen.open();
        const network = await app.page.context().newCDPSession(app.page);
        await throttle(network, 128 * 1024);
        const first = `rc-e2e first ${project()}.wav`;
        let drag = await app.dragFiles([media.track('First', { name: first, seconds: 10 })]);
        await drag.moveTo(screen.list);
        await drag.drop();
        await app.menuItem(t('upload.atEnd')).click();
        await expect(app.notice).toContainText(t('upload.progress', { current: 1, total: 1 }));

        const second = `rc-e2e second ${project()}.wav`;
        drag = await app.dragFiles([media.track('Second', { name: second })]);
        await drag.moveTo(screen.row('Track 2'), 2);
        await drag.drop();
        await app.menuItem(t('upload.here')).click();
        await expect(app.notice.getByTestId('upload-job').nth(1)).toContainText(t('upload.waiting'));
        await throttle(network);
        await expect.poll(() => fileNames(api, playlist.id), { timeout: 30_000 }).toEqual([a, second, b, first]);
        await expect(app.notice).toBeHidden();
    });

    test('an empty playlist takes dropped files without asking where', async ({ api, app, media, playlists }) => {
        const playlist = await playlists.create();
        const screen = new PlaylistScreen(app, playlist.name);
        await screen.open();
        const dropped = `rc-e2e into empty ${project()}.wav`;
        const drag = await app.dragFiles([media.track('Into empty', { name: dropped })]);
        await drag.moveTo(screen.list);
        await expect(app.main.getByTestId('drop-line')).toHaveCount(0);
        await expect(app.main.getByTestId('drop-frame')).toBeVisible();
        await drag.drop();
        await expect.poll(() => fileNames(api, playlist.id)).toEqual([dropped]);
        await expect(app.page.getByRole('menu')).toBeHidden();
    });

    test('a dropped folder goes up whole, and the player adds what it plays', async ({
        api,
        app,
        media,
        playlists,
    }) => {
        const playlist = await playlists.create({ tracks: 1 });
        const album = `rc-e2e Album ${project()}`;
        media.track('Song A', { folder: album, name: '1.wav' });
        media.track('Song B', { folder: path.join(album, 'CD2'), name: '2.wav' });
        fs.writeFileSync(path.join(media.dir, album, 'cover.jpg'), 'not a picture');
        // What the systems leave behind stays behind.
        const junk = ['.DS_Store', 'Thumbs.db', path.join('__MACOSX', '._1.wav')];
        for (const file of junk) {
            fs.mkdirSync(path.dirname(path.join(media.dir, album, file)), { recursive: true });
            fs.writeFileSync(path.join(media.dir, album, file), 'junk');
        }
        const screen = new PlaylistScreen(app, playlist.name);
        await screen.open();

        const drag = await app.dragFiles([path.join(media.dir, album)]);
        await drag.moveTo(screen.list);
        await drag.drop();
        await app.menuItem(t('upload.atStart')).click();
        await expect.poll(() => api.playlistItemCount(playlist.id)).toBe(3);
        const items = await api.allItems(playlist.id);
        expect(items.map(item => path.basename(item.fileUri))).toEqual([
            '1.wav',
            '2.wav',
            path.basename(playlist.files[0]),
        ]);
        // The cover went up with the tracks, into the folder of their own on the player.
        const uploaded = path.dirname(items[0].fileUri);
        expect(path.dirname(uploaded)).toBe(uploadDir);
        expect(fs.readFileSync(path.join(uploaded, 'cover.jpg'), 'utf8')).toBe('not a picture');
        for (const file of [...junk, '__MACOSX']) expect(fs.existsSync(path.join(uploaded, file))).toBe(false);
    });

    test('the drawer takes files into a playlist, or into a new one', async ({ api, app, media, playlists }) => {
        test.skip(!app.drawerDocked, 'the drawer is closed over a screen that takes the drag');
        const playlist = await playlists.create({ tracks: 1 });
        const screen = new PlaylistScreen(app, playlist.name);
        await screen.open();
        const zone = app.page.getByTestId('new-playlist-zone');

        const into = `rc-e2e into ${project()}.wav`;
        let drag = await app.dragFiles([media.track('Into it', { name: into })]);
        const resting = await app.playlistLink(playlist.name).boundingBox();
        await drag.moveTo(app.playlistLink(playlist.name));
        await expect(zone).toContainText(t('upload.newPlaylist'));
        // The zone takes the add button's place too.
        await expect(app.navigation.getByRole('button', { name: t('playlists.create') })).toBeHidden();
        // The zone takes the search's place without moving the list.
        expect((await app.playlistLink(playlist.name).boundingBox())!.y).toBe(resting!.y);
        await drag.drop();
        await expect(zone).toBeHidden();
        await expect.poll(() => fileNames(api, playlist.id)).toEqual([path.basename(playlist.files[0]), into]);

        const before = (await api.playlists()).map(({ id }) => id);
        const folder = `rc-e2e New ${project()}`;
        media.track('Fresh', { folder, name: 'fresh.wav' });
        const network = await app.page.context().newCDPSession(app.page);
        await throttle(network, 32 * 1024);
        drag = await app.dragFiles([path.join(media.dir, folder)]);
        await drag.moveTo(app.main);
        await drag.moveTo(zone);
        await expect(zone).toContainText(t('upload.dropNew'));
        await drag.drop();
        // On its way, its line's cancel button lies under the add button.
        const right = async (button: Locator) => {
            const box = (await button.boundingBox())!;
            return box.x + box.width;
        };
        const cancel = app.page.getByTestId('new-playlist-upload').getByRole('button', { name: t('actions.cancel') });
        expect(await right(cancel)).toBe(
            await right(app.navigation.getByRole('button', { name: t('playlists.create') })),
        );
        await throttle(network);
        await expect.poll(async () => (await api.playlists()).filter(({ id }) => !before.includes(id))).toHaveLength(1);
        const { id } = (await api.playlists()).find(playlist => !before.includes(playlist.id))!;
        await expect.poll(() => fileNames(api, id)).toEqual(['fresh.wav']);
        // Named by the player after its content, and shown.
        const { name } = (await api.playlist(id))!;
        playlists.adopt(name);
        await expect(app.heading).toHaveText(name);
    });
});

test.describe('dropping files with uploads disallowed', () => {
    withPluginSettings({ uploadTracks: false });
    // Chrome hands a page no drag events at all while it emulates touch.
    test.beforeEach(({ app }) => test.skip(app.touch, 'no drag events under touch emulation'));

    test('the list tells why it takes no files', async ({ app, media, playlists }) => {
        const playlist = await playlists.create({ tracks: 1 });
        const screen = new PlaylistScreen(app, playlist.name);
        await screen.open();
        const drag = await app.dragFiles([media.track('Refused')]);
        await drag.moveTo(screen.list);
        const refused = app.main.getByTestId('drop-refused');
        await expect(refused).toContainText(t('upload.disabled'));
        await expect(screen.list.getByTestId('drop-line')).toHaveCount(0);
        await drag.cancel();
        await expect(refused).toBeHidden();
    });
});

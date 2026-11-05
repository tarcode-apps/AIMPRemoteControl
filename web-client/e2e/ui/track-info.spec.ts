import path from 'node:path';
import type { TestPlaylist } from '../fixtures';
import { expect, test } from './fixtures';
import { ListScreen } from './pages/list-screen';
import { PlaylistScreen } from './pages/playlist-screen';
import { TrackInfoScreen } from './pages/track-info-screen';
import { t } from './strings';

// Long enough that the track does not end while the player's menu is in use.
const seconds = 60;
const lyrics = 'First line\nSecond line';

test.describe('track information', () => {
    let playlist: TestPlaylist;
    let screen: PlaylistScreen;
    let info: TrackInfoScreen;

    test.beforeEach(async ({ app, media, playlists }) => {
        // The folder's image, which the player takes as the tracks' cover.
        media.cover();
        playlist = await playlists.create({
            tracks: [
                {
                    title: 'Alpha',
                    artist: 'First Artist',
                    album: 'First Album',
                    albumArtist: 'Album Artist',
                    year: '2021',
                    trackNumber: '7',
                    lyricist: 'The Lyricist',
                    lyrics,
                    seconds,
                },
                { title: 'Bravo', seconds, lrc: '[00:01.00] Sung line\n[00:03.00] Second sung line\n' },
            ],
        });
        screen = new PlaylistScreen(app, playlist.name);
        info = new TrackInfoScreen(app);
    });

    test('shows the tags, the stream and the statistics, by page, and copies them all', async ({
        app,
        context,
        page,
    }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await screen.open();
        await screen.rowAction('Alpha', t('trackInfo.open'));
        await info.expectOpen(path.basename(playlist.files[0]));

        await expect(info.value('duration')).toHaveText('1:00.000');
        await expect(info.value('stream')).toHaveText(/^22 kHz, (35[23] kbps, )?16 bit, Mono$/);
        await expect(info.value('format')).toHaveText('WAVE (PCM)');
        await expect(info.value('playCount')).toHaveText('0');
        await expect(info.value('lastPlayed')).toHaveText(t('trackInfo.neverPlayed'));
        await expect(info.value('title')).toHaveText('Alpha');
        await expect(info.value('artist')).toHaveText('First Artist');
        await expect(info.value('album')).toHaveText('First Album');
        await expect(info.value('albumArtist')).toHaveText('Album Artist');
        await expect(info.value('genre')).toHaveText('Test Genre');
        await expect(info.value('year')).toHaveText('2021');
        await expect(info.value('trackNumber')).toHaveText('7');
        await expect(info.value('file')).toHaveText(playlist.files[0]);
        await expect(info.value('lyrics')).toBeHidden();

        await info.showLyrics();
        await expect(info.value('lyricist')).toHaveText('The Lyricist');
        await expect(info.value('lyrics')).toHaveText(lyrics);
        await expect(info.value('title')).toBeHidden();
        await expect(info.value('file')).toBeHidden();
        await info.showTags();
        await expect(info.value('file')).toHaveText(playlist.files[0]);

        await info.copy();
        const copied = await page.evaluate(() => navigator.clipboard.readText());
        expect(copied).toContain(`${t('trackInfo.fields.artist')}: First Artist`);
        expect(copied).toContain(`${t('trackInfo.fields.file')}: ${playlist.files[0]}`);
        expect(copied).toMatch(/First line\r?\nSecond line/);

        // The toast of the last copy may still be up, so the clipboard tells.
        await info.copyValue('artist');
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('First Artist');

        // The arrow leads back to the playlist it was opened from, docked or not.
        await app.backButton.click();
        await expect(screen.row('Alpha')).toBeInViewport();
    });

    test('the cover opens over everything, named for saving, zooms alone, and back or a click closes it', async ({
        app,
        page,
    }) => {
        await screen.open();
        await screen.rowAction('Alpha', t('trackInfo.open'));
        await info.expectOpen(path.basename(playlist.files[0]));

        await info.viewCover();
        // The browser's own menu saves the image under the name the server gives it.
        const disposition = await info.viewer
            .getByRole('img')
            .evaluate(async (image: HTMLImageElement) =>
                (await fetch(image.currentSrc)).headers.get('Content-Disposition'),
            );
        expect(disposition).toContain('filename="Album Artist - First Album.png"');

        // A pinch scales the image and leaves the page as it is. The point between
        // the fingers stays under them, near an edge too, until they let go.
        const below = -150;
        const before = await info.imagePointAt(below);
        await info.pinch(100, 200, { below, lift: false });
        const during = await info.imagePointAt(below);
        expect(during.x).toBeCloseTo(before.x, 2);
        expect(during.y).toBeCloseTo(before.y, 2);
        await info.lift(200, { below });
        expect(await info.imageScale()).toBeCloseTo(2, 1);
        expect(await page.evaluate(() => visualViewport?.scale)).toBe(1);

        // Flung by a finger, the zoomed image glides on after it lifts.
        await info.flick(-60);
        const lifted = await info.imageOffset();
        await expect.poll(() => info.imageOffset()).toBeLessThan(lifted - 30);
        // Held, it goes past its edge, and springs back when the finger lifts.
        const settled = await info.imageOffset();
        await info.flick(-600, { lift: false });
        const pulled = await info.imageOffset();
        expect(pulled).toBeLessThan(settled - 500);
        await info.liftFinger();
        await expect.poll(() => info.imageOffset()).toBeGreaterThan(pulled + 300);

        await page.goBack();
        await expect(info.viewer).toBeHidden();
        await expect(app.heading).toHaveText(t('trackInfo.title'));

        // Each opening starts unzoomed, and a finger does not move an image that fits.
        await info.viewCover();
        expect(await info.imageScale()).toBe(1);
        await info.flick(-60);
        expect(await info.imageOffset()).toBe(0);
        // The wheel zooms too.
        await info.viewer.getByRole('img').hover();
        await page.mouse.wheel(0, -200);
        await expect.poll(() => info.imageScale()).toBeGreaterThan(1);
        await info.viewer.click();
        await expect(info.viewer).toBeHidden();
        await expect(app.heading).toHaveText(t('trackInfo.title'));
    });

    test('a track without tags says so but has the lyrics beside it, and one that leaves its playlist says so too', async ({
        api,
        app,
        page,
    }) => {
        await screen.open();
        await screen.rowAction('Bravo', t('trackInfo.open'));
        await info.expectOpen(path.basename(playlist.files[1]));
        await expect(info.value('albumArtist')).toHaveText(t('trackInfo.notSet'));
        await expect(info.value('year')).toHaveText(t('trackInfo.notSet'));
        // The lyrics are the ones the player finds, here in an .lrc file, without the times.
        await info.showLyrics();
        await expect(info.value('lyricist')).toHaveText(t('trackInfo.notSet'));
        await expect(info.value('lyrics')).toHaveText('Sung line\nSecond sung line');
        await info.showTags();

        await api.post(`/playlists/${encodeURIComponent(playlist.id)}/items/remove`, { indexes: [1] });
        await expect(app.notice).toHaveText(t('trackInfo.gone'));
        // What was read stays on screen.
        await expect(info.value('title')).toHaveText('Bravo');
        await page.reload();
        await expect(app.heading).toHaveText(t('trackInfo.title'));
        await expect(app.notice).toHaveText(t('trackInfo.gone'));
    });

    test('opens from the queue and from the player, and back returns there', async ({ api, app, page, player }) => {
        await api.enqueue(playlist.id, [0]);
        const queue = new ListScreen(app, app.main.getByRole('listbox', { name: t('screens.queue') }));
        await app.goto('/queue/');
        await queue.rowAction('Alpha', t('trackInfo.open'));
        await info.expectOpen(path.basename(playlist.files[0]));
        await page.goBack();
        await expect(app.heading).toHaveText(t('queue.title'));
        await expect(queue.row('Alpha')).toBeVisible();

        await api.play(playlist.id, 1);
        await expect.poll(async () => (await api.player()).state).toBe('playing');
        // A mobile opens on the expanded player, as AIMP for Android does.
        await app.goto('/');
        await player.chooseFromTrackMenu(t('trackInfo.open'));
        await info.expectOpen(path.basename(playlist.files[1]));
        await page.goBack();
        await expect(player.full).toBeInViewport({ ratio: 0.9 });
        await expect(player.title).toHaveText('Bravo');
    });
});

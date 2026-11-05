import type { TestPlaylist } from '../fixtures';
import { expect, test } from './fixtures';
import { radioCaptureName } from './pages/player-panel';
import { PlaylistScreen } from './pages/playlist-screen';
import { t } from './strings';

// Long enough that no track ends during a test.
const seconds = 60;

test.describe('player', () => {
    let playlist: TestPlaylist;

    test.beforeEach(async ({ api, app, playlists }) => {
        playlist = await playlists.create({
            tracks: [
                { title: 'Alpha', artist: 'First Artist', seconds },
                { title: 'Bravo', artist: 'Second Artist', seconds },
                { title: 'Charlie', seconds },
            ],
        });
        await api.play(playlist.id, 0);
        await expect.poll(async () => (await api.player()).state).toBe('playing');
        // A mobile opens on the expanded player, as AIMP for Android does.
        await app.goto('/');
    });

    test('shows the playing track and follows the player', async ({ api, player }) => {
        await expect(player.title).toHaveText('Alpha');
        await expect(player.artist).toHaveText('First Artist');
        await expect(player.trackPosition).toHaveText(t('player.trackPosition', { position: 1, count: 3 }));

        await api.command('next');
        await expect(player.title).toHaveText('Bravo');
        await expect(player.trackPosition).toHaveText(t('player.trackPosition', { position: 2, count: 3 }));
    });

    test('the transport buttons drive the player', async ({ api, player }) => {
        await player.pauseButton().click();
        await expect.poll(async () => (await api.player()).state, { timeout: 5000 }).toBe('paused');
        await player.playButton().click();
        await expect.poll(async () => (await api.player()).state, { timeout: 5000 }).toBe('playing');

        await player.nextButton.click();
        await expect.poll(async () => (await api.player()).track?.index).toBe(1);
        await expect(player.title).toHaveText('Bravo');
        await player.previousButton.click();
        await expect.poll(async () => (await api.player()).track?.index).toBe(0);
    });

    test('shuffle toggles and repeat goes round its modes', async ({ api, player }) => {
        await player.shuffleButton.click();
        await expect.poll(async () => (await api.player()).shuffle).toBe(true);
        await player.shuffleButton.click();
        await expect.poll(async () => (await api.player()).shuffle).toBe(false);

        // The client sends the mode after the one it knows; a click before the
        // player's event reaches it sends the same mode again, so a click is
        // repeated until the player has the next one.
        for (const mode of ['playlist', 'track', 'off']) {
            await expect(async () => {
                await player.repeatButton.click();
                await expect.poll(async () => (await api.player()).repeat, { timeout: 2000 }).toBe(mode);
            }).toPass();
        }
    });

    test('a stream can be captured but not seeked, a file the other way round', async ({
        api,
        app,
        player,
        playlists,
        streams,
    }) => {
        // A file plays: a wide screen greys the button out, a mobile has no room to waste on it.
        if (app.drawerDocked) {
            await expect(player.radioCaptureButton).toBeDisabled();
            await expect(player.radioCaptureButton).toHaveAccessibleName(t('player.radioCapture'));
        } else await expect(player.radioCaptureButton).toBeHidden();
        await expect(player.positionSlider).toBeEnabled();
        const radio = await playlists.create({ urls: [streams.station()] });
        await api.play(radio.id, 0);
        await expect(player.radioCaptureButton).toBeEnabled();
        // A stream has no length: the position cannot be set.
        await expect(player.positionSlider).toBeDisabled();
        await expect(player.radioCaptureButton).toHaveAccessibleName(radioCaptureName(false));
        try {
            await player.radioCaptureButton.click();
            await expect.poll(async () => (await api.player()).radioCapture).toBe(true);
            await expect(player.radioCaptureButton).toHaveAccessibleName(radioCaptureName(true));
            await player.radioCaptureButton.click();
            await expect.poll(async () => (await api.player()).radioCapture).toBe(false);
        } finally {
            await api.patch('/player', { radioCapture: false });
        }
    });

    test('the mini player expands into the sheet and back', async ({ app, player }) => {
        test.skip(app.playerDocked, 'a docked player has no sheet');
        await expect(player.full).toBeInViewport({ ratio: 0.9 });
        await player.collapse();
        await expect(player.mini).toContainText('Alpha');
        await expect(player.mini).toContainText('First Artist');
        await player.expand();
        await expect(player.title).toHaveText('Alpha');
    });

    test('the heart keeps the track among the favorites', async ({ app, player }) => {
        await expect(player.favoriteButton).toHaveAccessibleName(t('favorites.add'));
        await player.favoriteButton.click();
        await expect(player.favoriteButton).toHaveAccessibleName(t('favorites.remove'));

        if (!app.playerDocked) await player.collapse();
        await app.openScreen(t('screens.favorites'));
        await expect(app.main.getByTestId('item-row').filter({ hasText: 'Alpha' })).toBeVisible();
    });

    test('Go to playlist shows the playing track in its playlist', async ({ api, app, player }) => {
        await api.play(playlist.id, 2);
        await expect(player.title).toHaveText('Charlie');
        await player.chooseFromTrackMenu(t('player.goToPlaylist'));
        const screen = new PlaylistScreen(app, playlist.name);
        await expect(screen.row('Charlie')).toHaveAttribute('aria-selected', 'true');
        await expect(screen.row('Charlie')).toBeInViewport();
    });
});

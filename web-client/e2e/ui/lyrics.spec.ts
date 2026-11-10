import type { TestPlaylist } from '../fixtures';
import { expect, test } from './fixtures';

// Long enough that no track ends during a test.
const seconds = 60;
const lineNames = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];
// A line every two seconds from the first second.
const lrc = lineNames.map((name, i) => `[00:${String(1 + i * 2).padStart(2, '0')}.00] ${name} line`).join('\n');

test.describe('lyrics', () => {
    let playlist: TestPlaylist;

    test.beforeEach(async ({ api, app, playlists }) => {
        playlist = await playlists.create({
            tracks: [
                { title: 'Synced', seconds, lrc },
                { title: 'Plain', seconds, lyrics: 'Verse one\nVerse two' },
                { title: 'Silent', seconds },
            ],
        });
        await api.play(playlist.id, 0);
        await expect.poll(async () => (await api.player()).state).toBe('playing');
        await app.goto('/');
    });

    test('synced lyrics follow the playback, and a hold or a double click seeks to a line', async ({ api, player }) => {
        await api.command('pause');
        await api.setPlayer({ position: 3.5 });
        await player.showLyrics();
        await expect(player.lyricsLines).toHaveCount(lineNames.length);
        await expect(player.currentLine).toHaveText('Second line');
        // The lines up to six seconds ahead are highlighted, the rest drawn in grey:
        // the fifth, sung at 9 s, is highlighted, the sixth, at 11 s, is not yet.
        const colour = (index: number) => player.lyricsLines.nth(index).evaluate(line => getComputedStyle(line).color);
        expect(await colour(5)).not.toBe(await colour(4));

        await api.command('play');
        await expect(player.currentLine).toHaveText('Third line', { timeout: 5000 });

        await api.command('pause');
        await player.holdLine(3);
        await expect.poll(async () => (await api.player()).position).toBeGreaterThanOrEqual(7);
        await expect(player.currentLine).toHaveText('Fourth line');
        await expect.poll(() => colour(5)).toBe(await colour(4));

        await player.lyricsLines.nth(1).dblclick();
        await expect.poll(async () => (await api.player()).position).toBeLessThan(5);
        await expect(player.currentLine).toHaveText('Second line');
    });

    test('plain lyrics are shown whole, and their absence is said', async ({ api, player }) => {
        await api.play(playlist.id, 1);
        await expect(player.title).toHaveText('Plain');
        await player.showLyrics();
        await expect(player.lyricsLines).toHaveText(['Verse one', 'Verse two']);
        await expect(player.currentLine).toHaveCount(0);
        // Lyrics shorter than their box stand in its middle.
        const box = (await player.lyrics.boundingBox())!;
        const first = (await player.lyricsLines.first().boundingBox())!;
        const last = (await player.lyricsLines.last().boundingBox())!;
        expect(Math.abs(first.y - box.y - (box.y + box.height - last.y - last.height))).toBeLessThan(2);

        await api.play(playlist.id, 2);
        await expect(player.noLyrics).toBeVisible();
        await expect(player.lyrics).toHaveCount(0);
    });

    test('the lyrics take the title block or the room under the cover, and stay shown', async ({ app, player }) => {
        const room = await player.lyricsHaveRoom();
        await expect(player.title).toHaveText('Synced');
        await player.showLyrics();
        await expect(player.lyrics).toBeVisible();
        // The title lines make way for the lyrics only where there is no room for both.
        if (room) await expect(player.title).toHaveText('Synced');
        else await expect(player.title).toBeHidden();

        await app.page.reload();
        await expect(player.lyrics).toBeVisible();

        await player.hideLyrics();
        await expect(player.lyrics).toBeHidden();
        await expect(player.title).toHaveText('Synced');
    });

    test('a swipe either way across the title lines turns between them and the lyrics', async ({ player }) => {
        test.skip(await player.lyricsHaveRoom(), 'the lyrics have room under the cover');
        const width = (await player.titlePages.boundingBox())!.width;
        await player.swipeTitleBlock(-width * 0.6);
        await expect(player.lyrics).toBeVisible();
        await expect(player.title).toBeHidden();

        await player.swipeTitleBlock(-width * 0.6);
        await expect(player.title).toHaveText('Synced');
        await expect(player.lyrics).toBeHidden();

        await player.swipeTitleBlock(width * 0.6);
        await expect(player.lyrics).toBeVisible();
        await expect(player.title).toBeHidden();
    });
});

import type { PlayerCursor, PlayerState } from '@/app/_api/types';
import { expect, test } from '../fixtures';

const unknownId = '{00000000-0000-0000-0000-000000000000}';
// Pause and stop fade out for a moment before the player reports them.
const playerTimeout = { timeout: 5000 };

test.describe('player', () => {
    test('plays an item and reports the track', async ({ api, events, playlists }) => {
        const playlist = await playlists.create({
            tracks: [{ title: 'First', artist: 'Artist A', album: 'Album A', seconds: 10 }, { seconds: 10 }],
        });
        const reported = events.next<PlayerState>('player', state => state.state === 'playing');
        expect((await api.post('/player/play', { playlistId: playlist.id, index: 0 })).status).toBe(200);
        expect((await reported).track).toMatchObject({ playlistId: playlist.id, index: 0 });

        const state = await api.player();
        expect(state).toMatchObject({ state: 'playing', duration: expect.closeTo(10, 0) });
        expect(state.track).toMatchObject({
            playlistId: playlist.id,
            index: 0,
            title: 'First',
            artist: 'Artist A',
            album: 'Album A',
            isUrl: false,
            fileUri: playlist.files[0],
        });
        expect(state.track!.playlistRevision).toBe((await api.playlist(playlist.id))!.revision);
    });

    test("pauses, resumes and stops as the player's buttons do", async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: [{ seconds: 20 }] });
        await api.play(playlist.id, 0);
        await expect.poll(async () => (await api.player()).state).toBe('playing');

        await api.command('pause');
        await expect.poll(async () => (await api.player()).state, playerTimeout).toBe('paused');
        await api.command('pause');
        await expect.poll(async () => (await api.player()).state, playerTimeout).toBe('playing');
        await api.command('stop');
        await expect.poll(async () => (await api.player()).state, playerTimeout).toBe('stopped');
        // A stopped player shows nothing.
        expect((await api.player()).track).toBeNull();

        // Play without an item restarts the last track.
        await api.command('play');
        await expect.poll(async () => (await api.player()).track?.fileUri).toBe(playlist.files[0]);
    });

    test('goes to the next and the previous track, and on by itself at the end', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: [{ seconds: 20 }, { seconds: 2 }, { seconds: 20 }] });
        await api.play(playlist.id, 0);
        await expect.poll(async () => (await api.player()).track?.index).toBe(0);
        await api.command('next');
        await expect.poll(async () => (await api.player()).track?.index).toBe(1);
        // The second track is two seconds long.
        await expect.poll(async () => (await api.player()).track?.index, { timeout: 8000 }).toBe(2);
        await api.command('previous');
        await expect.poll(async () => (await api.player()).track?.index).toBe(1);
    });

    test('seeks and sets volume, mute, repeat and shuffle', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: [{ seconds: 30 }] });
        await api.play(playlist.id, 0);
        await expect.poll(async () => (await api.player()).state).toBe('playing');
        const before = await api.player();
        try {
            expect((await api.patch('/player', { position: 20 })).status).toBe(200);
            await expect.poll(async () => (await api.player()).position).toBeGreaterThanOrEqual(19.5);

            await api.setPlayer({ volume: 0.4, mute: false, repeat: 'track', shuffle: true });
            await expect
                .poll(async () => {
                    const state = await api.player();
                    return [state.volume, state.mute, state.repeat, state.shuffle];
                })
                .toEqual([0.4, false, 'track', true]);
            await api.setPlayer({ repeat: 'playlist' });
            await expect.poll(async () => (await api.player()).repeat).toBe('playlist');
        } finally {
            await api.setPlayer({ volume: before.volume, mute: before.mute });
        }
    });

    test('captures a stream and refuses to capture a file', async ({ api, playlists, streams }) => {
        const playlist = await playlists.create({ tracks: [{ seconds: 30 }], urls: [streams.station()] });
        await api.play(playlist.id, 0);
        await expect.poll(async () => (await api.player()).state).toBe('playing');
        expect((await api.patch('/player', { radioCapture: true })).error?.code).toBe('playerCommandFailed');

        await api.play(playlist.id, 1);
        await expect.poll(async () => (await api.player()).track?.isUrl).toBe(true);
        expect((await api.player()).duration).toBe(0);
        try {
            await api.setPlayer({ radioCapture: true });
            await expect.poll(async () => (await api.player()).radioCapture).toBe(true);
        } finally {
            await api.setPlayer({ radioCapture: false });
        }
        await expect.poll(async () => (await api.player()).radioCapture).toBe(false);
    });

    test('refuses bad settings and unknown items', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: 1 });
        for (const body of [
            {},
            { volume: 1.5 },
            { volume: -0.1 },
            { position: -1 },
            { repeat: 'always' },
            { shuffle: 1 },
            { radioCapture: 'on' },
        ])
            expect((await api.patch('/player', body)).error?.code, JSON.stringify(body)).toBe('invalidBody');
        expect((await api.post('/player/play', { playlistId: playlist.id, index: 4 })).error?.code).toBe(
            'itemNotFound',
        );
        expect((await api.post('/player/play', { playlistId: unknownId, index: 0 })).error?.code).toBe(
            'playlistNotFound',
        );
        expect((await api.post('/player/play', { playlistId: playlist.id })).error?.code).toBe('invalidBody');
        const revision = (await api.playlist(playlist.id))!.revision;
        expect(
            (await api.post('/player/play', { playlistId: playlist.id, index: 0, revision: revision + 100 })).error
                ?.code,
        ).toBe('playlistChanged');
    });

    test('points at the playing track as its cursor', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: [{ seconds: 20 }, { seconds: 20 }] });
        await api.play(playlist.id, 1);
        await expect.poll(async () => (await api.player()).track?.index).toBe(1);
        const cursor = await api.get<PlayerCursor>('/player/cursor');
        expect(cursor.body).toEqual({ playlistId: playlist.id, index: 1 });
    });

    test('sends one player event for a track switch', async ({ api, events, playlists }) => {
        const playlist = await playlists.create({ tracks: [{ seconds: 20 }, { seconds: 20 }] });
        await api.play(playlist.id, 0);
        await expect.poll(async () => (await api.player()).track?.index).toBe(0);
        // Let the start of the first track settle into its own event.
        await events.next<PlayerState>('player', state => state.track?.index === 0).catch(() => undefined);
        const from = events.received('player').length;

        await api.command('next');
        await events.next<PlayerState>('player', state => state.track?.index === 1 && state.state === 'playing');
        const switching = events
            .received('player')
            .slice(from)
            .map(event => event.data as PlayerState);
        // The stop between the tracks is not reported as an event of its own.
        expect(switching.filter(state => state.state === 'stopped')).toHaveLength(0);
    });
});

import { expect, test } from '../../fixtures';
import { legacyPlaylistId, legacyTrackIds } from '../../lib/legacy';

// Pause and stop fade out for a moment before the player reports them.
const playerTimeout = { timeout: 5000 };

test.describe('frozen protocol: playback control', () => {
    test('Play starts a track and answers the state before it', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: [{ seconds: 20 }, { seconds: 20 }] });
        const legacyId = await legacyPlaylistId(api, playlist.name);
        const trackIds = await legacyTrackIds(api, legacyId);

        const answer = await api.rpcResult<{ playback_state: string; playlist_id: number; track_id: number }>('Play', {
            track_id: trackIds[1],
        });
        expect(answer.playback_state).toBe('stopped');
        expect(answer).toHaveProperty('playlist_id');
        expect(answer).toHaveProperty('track_id');
        await expect.poll(async () => (await api.player()).track?.index).toBe(1);
        expect((await api.rpc('Play', { track_id: 1 })).error?.code).toBe(21);
    });

    test('Pause toggles, Stop stops, PlayNext and PlayPrevious switch', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: [{ seconds: 20 }, { seconds: 20 }] });
        await api.play(playlist.id, 0);
        await expect.poll(async () => (await api.player()).state).toBe('playing');

        expect(await api.rpcResult('Pause')).toEqual({ playback_state: 'playing' });
        await expect.poll(async () => (await api.player()).state, playerTimeout).toBe('paused');
        expect(await api.rpcResult('Pause')).toEqual({ playback_state: 'paused' });
        await expect.poll(async () => (await api.player()).state, playerTimeout).toBe('playing');

        await api.rpcResult('PlayNext');
        await expect.poll(async () => (await api.player()).track?.index).toBe(1);
        await api.rpcResult('PlayPrevious');
        await expect.poll(async () => (await api.player()).track?.index).toBe(0);

        expect((await api.rpcResult<{ playback_state: string }>('Stop')).playback_state).toBe('playing');
        await expect.poll(async () => (await api.player()).state, playerTimeout).toBe('stopped');
    });

    test('Status reads and writes the player in percent', async ({ api }) => {
        const before = await api.player();
        try {
            expect(await api.rpcResult('Status', { status_id: 1, value: 40 })).toEqual({ value: 40 });
            await expect.poll(async () => (await api.player()).volume).toBeCloseTo(0.4, 2);
            expect(await api.rpcResult('Status', { status_id: 1 })).toEqual({ value: 40 });

            await api.rpcResult('Status', { status_id: 41, value: 1 });
            await expect.poll(async () => (await api.player()).shuffle).toBe(true);
            await api.rpcResult('Status', { status_id: 41, value: 0 });
            await expect.poll(async () => (await api.player()).shuffle).toBe(false);

            // 50 is the middle of the balance and the normal speed.
            await api.rpcResult('Status', { status_id: 2, value: 75 });
            expect((await api.effects()).balance).toBeCloseTo(0.5, 2);
            await api.rpcResult('Status', { status_id: 3, value: 50 });
            expect((await api.effects()).speed).toBeCloseTo(1, 2);
        } finally {
            await api.setPlayer({ volume: before.volume });
            await api.resetEffects();
        }
        expect((await api.rpc('Status', { status_id: 999 })).error?.code).toBe(-32602);
    });

    test('Equalizer reads and writes 18 bands of 0..100', async ({ api }) => {
        await api.resetEffects();
        const flat = await api.rpcResult<{ active: boolean; bands: number[] }>('Equalizer');
        expect(flat.active).toBe(true);
        expect(flat.bands).toHaveLength(18);
        expect(new Set(flat.bands)).toEqual(new Set([50]));

        const bands = Array.from({ length: 18 }, (_, i) => (i === 0 ? 100 : 50));
        const set = await api.rpcResult<{ active: boolean; bands: number[] }>('Equalizer', { active: false, bands });
        expect(set.active).toBe(false);
        expect(set.bands[0]).toBe(100);
        const state = await api.effects();
        expect(state.equalizer.active).toBe(false);
        expect(state.equalizer.bands[0].gain).toBeCloseTo(15, 1);

        expect((await api.rpc('Equalizer', { bands: [50, 50] })).error?.code).toBe(-32602);
        await api.resetEffects();
    });
});

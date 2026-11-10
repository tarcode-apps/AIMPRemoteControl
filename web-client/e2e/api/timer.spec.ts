import type { TimerState } from '@/app/_api/types';
import { expect, test } from '../fixtures';

// The timer fires on the player's own clock; a margin for the fade of the pause.
const fireTimeout = { timeout: 10_000 };

test.describe('timer', () => {
    test('offers the actions of this computer', async ({ api }) => {
        const state = await api.timer();
        expect(state.supportedActions).toEqual(
            expect.arrayContaining(['pause', 'closePlayer', 'shutdown', 'reboot', 'logOff']),
        );
        expect(state.timer).toBeNull();
    });

    const refused: [string, unknown][] = [
        ['no actions', { actions: [], trigger: 'after', seconds: 60 }],
        ['an unknown action', { actions: ['explode'], trigger: 'after', seconds: 60 }],
        ['two actions for the computer', { actions: ['shutdown', 'reboot'], trigger: 'after', seconds: 60 }],
        ['no trigger', { actions: ['pause'], seconds: 60 }],
        ['an unknown trigger', { actions: ['pause'], trigger: 'soon' }],
        ['a delay of zero', { actions: ['pause'], trigger: 'after', seconds: 0 }],
        ['a delay beyond a year', { actions: ['pause'], trigger: 'after', seconds: 400 * 24 * 3600 }],
        ['a moment in the past', { actions: ['pause'], trigger: 'at', at: Date.now() - 1000 }],
        ['too many tracks', { actions: ['pause'], trigger: 'trackEnd', tracks: 1001 }],
        ['no tracks', { actions: ['pause'], trigger: 'trackEnd', tracks: 0 }],
    ];
    for (const [what, body] of refused)
        test(`refuses ${what}`, async ({ api }) => {
            const response = await api.put('/timer', body);
            expect(response.status).toBe(400);
            expect(response.error?.code).toBe('invalidBody');
            expect((await api.timer()).timer).toBeNull();
        });

    test('sets a delay, reports it to both protocols and cancels it', async ({ api, events }) => {
        const announced = events.next<TimerState>('timer', state => state.timer !== null);
        const before = Date.now();
        const set = await api.put<TimerState>('/timer', { actions: ['pause'], trigger: 'after', seconds: 600 });
        expect(set.status).toBe(200);
        expect(set.body!.timer).toMatchObject({ actions: ['pause'], trigger: 'after', waitTrackEnd: false });
        expect(set.body!.timer!.expiresAt! - before).toBeGreaterThan(599_000);
        expect(set.body!.timer!.setAt).toBeGreaterThanOrEqual(before - 1000);
        await announced;

        // The frozen protocol's view of the same timer.
        const legacy = await api.rpcResult<{ current_timer?: { actions: string[]; expires_in: number } }>('Scheduler');
        expect(legacy.current_timer?.actions).toEqual(['pause_playback']);
        expect(legacy.current_timer?.expires_in).toBeGreaterThan(590);

        const cancelled = events.next<TimerState>('timer', state => state.timer === null);
        expect((await api.delete('/timer')).status).toBe(200);
        await cancelled;
        expect((await api.timer()).timer).toBeNull();
    });

    test('sets a time of day', async ({ api }) => {
        const at = Date.now() + 3600_000;
        const set = await api.put<TimerState>('/timer', { actions: ['pause'], trigger: 'at', at });
        expect(set.body!.timer).toMatchObject({ trigger: 'at', expiresAt: at });
    });

    test('pauses playback when the delay runs out', async ({ api, events, playlists }) => {
        const playlist = await playlists.create({ tracks: [{ seconds: 20 }] });
        await api.play(playlist.id, 0);
        await expect.poll(async () => (await api.player()).state).toBe('playing');
        const fired = events.next<TimerState>('timer', state => state.timer === null, { timeout: 15_000 });
        await api.put('/timer', { actions: ['pause'], trigger: 'after', seconds: 2 });
        await fired;
        await expect.poll(async () => (await api.player()).state, fireTimeout).toBe('paused');
    });

    test('waits for the playing track to finish when asked', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: [{ seconds: 5 }, { seconds: 20 }] });
        await api.play(playlist.id, 0);
        await expect.poll(async () => (await api.player()).state).toBe('playing');
        await api.put('/timer', { actions: ['pause'], trigger: 'after', seconds: 1, waitTrackEnd: true });
        await expect.poll(async () => (await api.timer()).timer?.waitingTrackEnd, fireTimeout).toBe(true);
        expect((await api.player()).state).toBe('playing');
        // Once the five-second track ends, the next one is paused at its start.
        await expect.poll(async () => (await api.timer()).timer, fireTimeout).toBeNull();
        await expect.poll(async () => (await api.player()).state, fireTimeout).toBe('paused');
        expect((await api.player()).track?.index).toBe(1);
    });

    test('counts the ends of tracks', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: [{ seconds: 2 }, { seconds: 2 }, { seconds: 20 }] });
        await api.play(playlist.id, 0);
        await expect.poll(async () => (await api.player()).state).toBe('playing');
        const set = await api.put<TimerState>('/timer', { actions: ['pause'], trigger: 'trackEnd', tracks: 2 });
        expect(set.body!.timer).toMatchObject({ trigger: 'trackEnd', tracks: 2, tracksLeft: 2, tracksEnded: 0 });
        await expect.poll(async () => (await api.timer()).timer?.tracksLeft, fireTimeout).toBe(1);
        await expect.poll(async () => (await api.timer()).timer, fireTimeout).toBeNull();
        await expect.poll(async () => (await api.player()).state, fireTimeout).toBe('paused');
        expect((await api.player()).track?.index).toBe(2);
    });

    test('fires at the end of the queue', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: [{ seconds: 20 }, { seconds: 2 }, { seconds: 20 }] });
        await api.enqueue(playlist.id, [1]);
        await api.play(playlist.id, 0);
        await expect.poll(async () => (await api.player()).state).toBe('playing');
        await api.put('/timer', { actions: ['pause'], trigger: 'queueEnd' });
        // From the first track to the queued one, whose end is the queue's.
        await api.command('next');
        await expect.poll(async () => (await api.player()).track?.index).toBe(1);
        await expect.poll(async () => (await api.timer()).timer, fireTimeout).toBeNull();
        await expect.poll(async () => (await api.player()).state, fireTimeout).toBe('paused');
    });

    test('fires at the end of the playlist', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: [{ seconds: 2 }, { seconds: 2 }] });
        await api.setPlayer({ repeat: 'off' });
        await api.play(playlist.id, 0);
        await expect.poll(async () => (await api.player()).state).toBe('playing');
        await api.put('/timer', { actions: ['pause'], trigger: 'playlistEnd' });
        expect((await api.timer()).timer).toMatchObject({ trigger: 'playlistEnd', tracksEnded: 0 });
        await expect.poll(async () => (await api.timer()).timer?.tracksEnded, fireTimeout).toBe(1);
        await expect.poll(async () => (await api.timer()).timer, fireTimeout).toBeNull();
    });
});

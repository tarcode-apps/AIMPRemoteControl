import { expect, test } from '../../fixtures';
import { legacyPlaylistId } from '../../lib/legacy';

// A long poll pending until its event; the change that wakes it comes once the
// request is surely in, as the app keeps it pending all the time.
async function wakeUp<T>(
    api: { rpc: (method: string, params: unknown) => Promise<{ result?: T; error?: unknown }> },
    event: string,
    change: () => Promise<unknown>,
) {
    const poll = api.rpc('SubscribeOnAIMPStateUpdateEvent', { event });
    await new Promise(resolve => setTimeout(resolve, 500));
    await change();
    return poll;
}

test.describe('frozen protocol: long polling', () => {
    test('control_panel_state_change wakes on a change of the player', async ({ api }) => {
        const { volume } = await api.player();
        try {
            const answer = await wakeUp<{ volume: number }>(api, 'control_panel_state_change', () =>
                api.setPlayer({ volume: volume > 0.5 ? 0.3 : 0.7 }),
            );
            expect(answer.result?.volume).toBe(volume > 0.5 ? 30 : 70);
        } finally {
            await api.setPlayer({ volume });
        }
    });

    test('playlists_content_change wakes when a playlist is added', async ({ api, playlists }) => {
        let name = '';
        const answer = await wakeUp<{ event: string; playlists: { id: number; crc32: number }[] }>(
            api,
            'playlists_content_change',
            async () => (name = (await playlists.create({ tracks: 1 })).name),
        );
        expect(answer.result?.event).toBe('playlists_changed');
        expect(answer.result?.playlists.some(p => p.id >= 0)).toBe(true);
        expect(await legacyPlaylistId(api, name)).toBeGreaterThanOrEqual(0);
    });

    test('queue_content_change wakes when the queue changes', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: 1 });
        const answer = await wakeUp(api, 'queue_content_change', () => api.enqueue(playlist.id, [0]));
        expect(answer.result).toEqual({ changed: true });
    });

    test('timer_state_change wakes when a timer is set', async ({ api }) => {
        const answer = await wakeUp<{ active: boolean; actions: string[]; expires_in: number }>(
            api,
            'timer_state_change',
            () => api.rpcResult('Scheduler', { action: 'pause_playback', expiration_delay: 600 }),
        );
        expect(answer.result).toMatchObject({ active: true, actions: ['pause_playback'] });
    });

    test('an unknown event is refused at once', async ({ api }) => {
        expect((await api.rpc('SubscribeOnAIMPStateUpdateEvent', { event: 'nonsense' })).error?.code).toBe(-32602);
    });
});

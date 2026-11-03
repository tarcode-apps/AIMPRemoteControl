import { expect, test } from '../../fixtures';

type SchedulerState = {
    supported_actions: string[];
    current_timer?: { actions: string[]; expires_in: number };
};

test.describe('frozen protocol: scheduler', () => {
    test('sets, reads and cancels a timer shared with the web API', async ({ api }) => {
        const idle = await api.rpcResult<SchedulerState>('Scheduler');
        expect(idle.supported_actions).toEqual(
            expect.arrayContaining(['pause_playback', 'player_shutdown', 'machine_shutdown']),
        );
        expect(idle.current_timer).toBeUndefined();

        const set = await api.rpcResult<SchedulerState>('Scheduler', {
            action: 'pause_playback',
            expiration_delay: 900,
        });
        expect(set.current_timer).toEqual({ actions: ['pause_playback'], expires_in: expect.any(Number) });
        expect(set.current_timer!.expires_in).toBeGreaterThan(890);
        expect((await api.timer()).timer).toMatchObject({ actions: ['pause'], trigger: 'after' });

        expect((await api.rpcResult<SchedulerState>('Scheduler', { cancel: 'true' })).current_timer).toBeUndefined();
        expect((await api.timer()).timer).toBeNull();
        await api.rpcResult('Scheduler', { action: 'pause_playback', expiration_delay: 900 });
        expect((await api.rpcResult<SchedulerState>('Scheduler', { cancel: true })).current_timer).toBeUndefined();
    });

    test('does not show a timer it cannot describe', async ({ api }) => {
        await api.put('/timer', { actions: ['pause'], trigger: 'queueEnd' });
        expect((await api.rpcResult<SchedulerState>('Scheduler')).current_timer).toBeUndefined();
    });

    test('refuses an unknown action and a bad delay', async ({ api }) => {
        expect((await api.rpc('Scheduler', { action: 'explode', expiration_delay: 60 })).error?.code).toBe(-32602);
        expect((await api.rpc('Scheduler', { action: 'pause_playback', expiration_delay: 0 })).error?.code).toBe(
            -32602,
        );
        expect((await api.rpc('Scheduler', { action: 'pause_playback' })).error?.code).toBe(-32602);
    });
});

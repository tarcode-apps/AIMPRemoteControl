import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { request } from './client';
import type { PlayerCommand, PlayerPatch, PlayerState, PlayTrackRequest } from './types';

// The state with the moment it was read: the position counts on from there.
export type PlayerSnapshot = PlayerState & { receivedAt: number };

export const playerKeys = {
    state: ['player'] as const,
};

export function snapshot(state: PlayerState): PlayerSnapshot {
    return { ...state, receivedAt: performance.now() };
}

export function positionOf(state: PlayerSnapshot, now = performance.now()): number {
    if (state.state !== 'playing') return state.position;
    const position = state.position + (now - state.receivedAt) / 1000;
    return state.duration > 0 ? Math.min(position, state.duration) : position;
}

export function usePlayer() {
    return useQuery({
        queryKey: playerKeys.state,
        queryFn: async ({ signal }) => snapshot(await request<PlayerState>('GET', '/player', { signal })),
        // The position drifts while the page sleeps in the background.
        staleTime: 0,
        refetchOnMount: false,
        refetchOnWindowFocus: true,
    });
}

// Re-renders on every whole second of the playing track. The clock is state, not
// read in render, so that memoization sees the position change.
export function usePlayerPosition(state: PlayerSnapshot | undefined, enabled: boolean): number {
    const [now, setNow] = useState(() => performance.now());
    const playing = enabled && state?.state === 'playing';
    useEffect(() => {
        if (!playing || !state) return;
        let timer: number;
        const schedule = () => {
            const wait = 1000 - ((positionOf(state) * 1000) % 1000);
            timer = window.setTimeout(() => {
                setNow(performance.now());
                schedule();
            }, wait);
        };
        schedule();
        return () => window.clearTimeout(timer);
    }, [playing, state]);
    return state ? positionOf(state, Math.max(now, state.receivedAt)) : 0;
}

// The prediction is shown until the `player` event confirms or corrects it, and
// taken back if the request fails.
function useOptimisticPlayerMutation<TVariables>(
    mutationFn: (variables: TVariables) => Promise<unknown>,
    predict: (state: PlayerSnapshot, variables: TVariables) => PlayerSnapshot | undefined,
) {
    const client = useQueryClient();
    return useMutation({
        mutationFn,
        onMutate: async variables => {
            await client.cancelQueries({ queryKey: playerKeys.state });
            const previous = client.getQueryData<PlayerSnapshot>(playerKeys.state);
            const predicted = previous && predict(previous, variables);
            if (predicted) client.setQueryData(playerKeys.state, predicted);
            return { previous, predicted };
        },
        onError: (_error, _variables, context) => {
            if (context?.predicted && client.getQueryData(playerKeys.state) === context.predicted)
                client.setQueryData(playerKeys.state, context.previous);
        },
    });
}

function predictCommand(state: PlayerSnapshot, command: PlayerCommand): PlayerSnapshot | undefined {
    const now = performance.now();
    switch (command) {
        case 'play':
            return state.state === 'paused' ? { ...state, state: 'playing', receivedAt: now } : undefined;
        case 'pause':
            if (state.state === 'playing')
                return { ...state, state: 'paused', position: positionOf(state, now), receivedAt: now };
            return state.state === 'paused' ? { ...state, state: 'playing', receivedAt: now } : undefined;
        case 'stop':
            return state.state === 'stopped'
                ? undefined
                : { ...state, state: 'stopped', position: 0, duration: 0, track: null, receivedAt: now };
        default:
            return undefined;
    }
}

export function usePlayerCommand() {
    return useOptimisticPlayerMutation(
        (command: PlayerCommand) => request<unknown>('POST', `/player/${command}`),
        predictCommand,
    );
}

export function useSetPlayer() {
    return useOptimisticPlayerMutation(
        (patch: PlayerPatch) => request<unknown>('PATCH', '/player', { body: patch }),
        (state, patch) => {
            const now = performance.now();
            return { ...state, position: positionOf(state, now), ...patch, receivedAt: now };
        },
    );
}

// Seeks from the latest known position, so repeated calls add up.
export function useSeekBy() {
    const client = useQueryClient();
    const setPlayer = useSetPlayer();
    return (seconds: number) => {
        const state = client.getQueryData<PlayerSnapshot>(playerKeys.state);
        if (!state || state.state === 'stopped') return;
        const position = Math.max(0, positionOf(state) + seconds);
        setPlayer.mutate({ position: state.duration > 0 ? Math.min(position, state.duration) : position });
    };
}

export function usePlayTrack() {
    return useMutation({
        mutationFn: (body: PlayTrackRequest) => request<unknown>('POST', '/player/play', { body }),
    });
}

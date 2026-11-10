import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { request } from './helpers/request';
import type { EffectsState, EqualizerPreset, SoundEffect } from './types';

// The player's value of each effect with the effect off.
export const effectsOff: Readonly<Record<SoundEffect, number>> = {
    echo: 0,
    reverb: 0,
    flanger: 0,
    chorus: 0,
    trueBass: 0,
    enhancer: 1,
    speed: 1,
    tempo: 1,
    pitch: 0,
};

// The player reports its values to three decimals.
const offTolerance = 0.0005;

// What changes the sound, the equalizer first: an effect counts when away from
// its value with it off. The balance is a position, not an effect.
export function activeEffects(state: EffectsState): 'equalizer' | 'effects' | null {
    if (state.equalizer.active) return 'equalizer';
    const names = Object.keys(effectsOff) as SoundEffect[];
    return names.some(name => Math.abs(state[name] - effectsOff[name]) > offTolerance) ? 'effects' : null;
}

export const effectsKeys = {
    state: ['effects'] as const,
    presets: ['effects', 'presets'] as const,
};

// Events and responses may arrive out of order, so an older state never
// replaces a newer one.
export function receiveEffects(client: QueryClient, state: EffectsState) {
    const known = client.getQueryData<EffectsState>(effectsKeys.state);
    if (!known || state.revision >= known.revision) client.setQueryData(effectsKeys.state, state);
}

// The `effects` event brings every change, the client's own included.
export function useEffects() {
    return useQuery({
        queryKey: effectsKeys.state,
        queryFn: ({ signal }) => request<EffectsState>('GET', '/effects', { signal }),
    });
}

// Nothing announces a change of the library, so it is read again after the
// client's own changes.
export function useEqualizerPresets(enabled = true) {
    return useQuery({
        queryKey: effectsKeys.presets,
        queryFn: ({ signal }) => request<EqualizerPreset[]>('GET', '/effects/presets', { signal }),
        enabled,
    });
}

// The state names the curve by its preset, so it is read again with the library.
function refetchLibrary(client: QueryClient) {
    return Promise.all([
        client.invalidateQueries({ queryKey: effectsKeys.presets }),
        client.invalidateQueries({ queryKey: effectsKeys.state }),
    ]);
}

export function useApplyPreset() {
    return useMutation({
        mutationFn: (name: string) => request<unknown>('POST', '/effects/presets/apply', { body: { name } }),
    });
}

export function useSavePreset() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (name: string) => request<unknown>('POST', '/effects/presets', { body: { name } }),
        onSuccess: () => refetchLibrary(client),
    });
}

export function useRenamePreset() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: { name: string; newName: string }) =>
            request<unknown>('POST', '/effects/presets/rename', { body }),
        onSuccess: () => refetchLibrary(client),
    });
}

export function useRemovePreset() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (name: string) => request<unknown>('POST', '/effects/presets/remove', { body: { name } }),
        onSuccess: () => refetchLibrary(client),
    });
}

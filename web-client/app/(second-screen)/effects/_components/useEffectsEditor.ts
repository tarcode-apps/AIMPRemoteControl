'use client';

import { receiveEffects } from '@/app/_api/effects';
import { request } from '@/app/_api/helpers/request';
import type { EffectsPatch, EffectsState, SoundEffect } from '@/app/_api/types';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// How long the user's value stands over the player's when the player does not
// report it: a value the player clamped or refused gives way after this.
const holdTimeout = 1500;
// The player reports its values to three decimals.
const tolerance = 0.0005;

type Key = SoundEffect | 'balance' | 'active' | 'auto' | 'preamp' | `band.${number}`;
type Value = number | boolean;
type Override = { value: Value; at: number };

export type EffectsEditor = {
    // The player's state with the user's latest changes over it.
    state: EffectsState | undefined;
    set(patch: EffectsPatch): void;
    // Of the last request; cleared by the next one that succeeds.
    error: unknown;
};

function flatten(patch: EffectsPatch): [Key, Value][] {
    const entries: [Key, Value][] = [];
    for (const [key, value] of Object.entries(patch))
        if (key !== 'equalizer' && typeof value === 'number') entries.push([key as Key, value]);
    const { equalizer } = patch;
    if (equalizer?.active !== undefined) entries.push(['active', equalizer.active]);
    if (equalizer?.auto !== undefined) entries.push(['auto', equalizer.auto]);
    if (equalizer?.preamp !== undefined) entries.push(['preamp', equalizer.preamp]);
    for (const band of equalizer?.bands ?? []) entries.push([`band.${band.index}`, band.gain]);
    return entries;
}

function valueOf(state: EffectsState, key: Key): Value | undefined {
    switch (key) {
        case 'active':
            return state.equalizer.active;
        case 'auto':
            return state.equalizer.auto;
        case 'preamp':
            return state.equalizer.preamp;
        default:
            if (key.startsWith('band.')) return state.equalizer.bands[Number(key.slice(5))]?.gain;
            return state[key as SoundEffect | 'balance'];
    }
}

function same(a: Value | undefined, b: Value): boolean {
    return typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= tolerance : a === b;
}

function merge(state: EffectsState, overrides: ReadonlyMap<Key, Override>): EffectsState {
    if (!overrides.size) return state;
    const next: EffectsState = {
        ...state,
        equalizer: { ...state.equalizer, bands: state.equalizer.bands.map(band => ({ ...band })) },
    };
    for (const [key, { value }] of overrides) {
        if (key === 'active' || key === 'auto') next.equalizer[key] = value as boolean;
        else if (key === 'preamp') next.equalizer.preamp = value as number;
        else if (key.startsWith('band.')) {
            const band = next.equalizer.bands[Number(key.slice(5))];
            if (band) {
                band.gain = value as number;
                next.equalizer.preset = null;
            }
        } else next[key as SoundEffect | 'balance'] = value as number;
    }
    return next;
}

// The later patch over the earlier; a band named by both takes the later gain.
function mergePatch(earlier: EffectsPatch, later: EffectsPatch): EffectsPatch {
    const bands = new Map((earlier.equalizer?.bands ?? []).map(band => [band.index, band]));
    for (const band of later.equalizer?.bands ?? []) bands.set(band.index, band);
    const equalizer = { ...earlier.equalizer, ...later.equalizer, bands: [...bands.values()] };
    if (!equalizer.bands.length) delete (equalizer as { bands?: unknown }).bands;
    const merged: EffectsPatch = { ...earlier, ...later };
    if (Object.keys(equalizer).length) merged.equalizer = equalizer;
    return merged;
}

// Shows every change at once and sends it to the player with one request in
// flight at a time, the latest values going next; a value is held until the
// player reports it, so that the event of an earlier step does not pull the
// control back while the user still moves it.
export function useEffectsEditor(server: EffectsState | undefined): EffectsEditor {
    const [overrides, setOverrides] = useState<ReadonlyMap<Key, Override>>(() => new Map());
    const [error, setError] = useState<unknown>(null);
    const client = useQueryClient();
    const queue = useRef<EffectsPatch | null>(null);
    const inFlight = useRef(false);

    useEffect(() => {
        if (!overrides.size) return;
        const prune = () =>
            setOverrides(current => {
                const now = Date.now();
                const kept = new Map(
                    [...current].filter(
                        ([key, override]) =>
                            !(server && same(valueOf(server, key), override.value)) && now - override.at <= holdTimeout,
                    ),
                );
                return kept.size === current.size ? current : kept;
            });
        prune();
        const timer = window.setTimeout(prune, holdTimeout);
        return () => window.clearTimeout(timer);
    }, [server, overrides]);

    // Sends what is queued, request after request, until nothing is left.
    const flush = useCallback(async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        while (queue.current) {
            const body = queue.current;
            queue.current = null;
            try {
                receiveEffects(client, await request<EffectsState>('PATCH', '/effects', { body }));
                setError(null);
            } catch (cause) {
                setError(cause);
            }
        }
        inFlight.current = false;
    }, [client]);

    const set = useCallback(
        (patch: EffectsPatch) => {
            const at = Date.now();
            setOverrides(current => {
                const next = new Map(current);
                for (const [key, value] of flatten(patch)) next.set(key, { value, at });
                return next;
            });
            queue.current = queue.current ? mergePatch(queue.current, patch) : patch;
            void flush();
        },
        [flush],
    );

    const state = useMemo(() => server && merge(server, overrides), [server, overrides]);
    return { state, set, error };
}

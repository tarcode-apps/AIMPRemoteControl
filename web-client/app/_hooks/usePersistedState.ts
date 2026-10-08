import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
// The raw values as last read or written, so that a render does not go to the
// storage, and where the storage is unavailable, the only copy for the page's
// lifetime.
const raws = new Map<string, string | null>();
// The value parsed from each raw one: every subscriber of a key shares it.
const parsed = new Map<string, { raw: string | null; value: unknown }>();

function notify() {
    for (const listener of listeners) listener();
}

if (typeof window !== 'undefined')
    window.addEventListener('storage', event => {
        if (event.key === null) raws.clear();
        else raws.delete(event.key);
        notify();
    });

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function read(key: string) {
    if (!raws.has(key)) {
        let raw: string | null = null;
        try {
            raw = localStorage.getItem(key);
        } catch {
            // Nothing stored yet; writes keep their copy in `raws`.
        }
        raws.set(key, raw);
    }
    return raws.get(key) ?? null;
}

export type Parse<T> = (stored: unknown) => T | undefined;

function parseRaw<T>(key: string, raw: string | null, fallback: T, parse: Parse<T>): T {
    const cached = parsed.get(key);
    if (cached && cached.raw === raw) return cached.value as T;
    let value = fallback;
    if (raw !== null)
        try {
            value = parse(JSON.parse(raw)) ?? fallback;
        } catch {
            value = fallback;
        }
    parsed.set(key, { raw, value });
    return value;
}

// The stored value as it is now, outside React. `fallback` and `parse` must be
// the same for every reader of a key.
export function readPersisted<T>(key: string, fallback: T, parse: Parse<T>): T {
    return parseRaw(key, read(key), fallback, parse);
}

export function writePersisted<T>(key: string, value: T) {
    const raw = JSON.stringify(value);
    raws.set(key, raw);
    try {
        localStorage.setItem(key, raw);
    } catch {
        // Kept for this page only.
    }
    notify();
}

// A per-viewer value kept in localStorage. It is `fallback` on the server and
// when `parse` makes nothing of what is stored.
export function usePersistedState<T>(key: string, fallback: T, parse: Parse<T>): [T, (value: T) => void] {
    const raw = useSyncExternalStore(
        subscribe,
        () => read(key),
        () => null,
    );
    return [parseRaw(key, raw, fallback, parse), next => writePersisted(key, next)];
}

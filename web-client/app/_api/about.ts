import { useSyncExternalStore } from 'react';

// Who the player is, as the event stream says it on connecting and again when the
// player is renamed; kept apart from the queries, which a reconnection refetches.
export type About = {
    name: string;
    aimpVersion: string;
    pluginVersion: string;
};

let current: About | undefined;
const listeners = new Set<() => void>();

export function receiveAbout(about: About) {
    current = about;
    for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function useAbout(): About | undefined {
    return useSyncExternalStore(
        subscribe,
        () => current,
        () => undefined,
    );
}

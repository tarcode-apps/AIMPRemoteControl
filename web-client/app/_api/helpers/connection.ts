import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

export type Connection = {
    // False from a loss of the player until the event stream opens again.
    online: boolean;
    // A failure was met, and the stream is being tried before the loss is shown.
    checking: boolean;
    // The player said it was shutting down.
    closed: boolean;
    // When the next attempt starts, by Date.now(); null while one is under way.
    retryAt: number | null;
    // When the loss was shown, by performance.now(): the player's clock stops there.
    lostAt: number | null;
    // Counts the attempts to do what needs the player while it is lost, for the
    // banner to draw the eye to itself.
    flashes: number;
};

type Handlers = { retry(): void; failed(): void };

const initial: Connection = { online: true, checking: false, closed: false, retryAt: null, lostAt: null, flashes: 0 };
let current = initial;
const listeners = new Set<() => void>();
let handlers: Handlers | undefined;

// The browser's own online events know nothing of a player in the local
// network, which needs neither the internet nor DNS: queries pause and resume
// by the connection to the player alone.
onlineManager.setEventListener(() => undefined);

export function updateConnection(change: Partial<Connection>) {
    current = { ...current, ...change };
    onlineManager.setOnline(current.online);
    for (const listener of listeners) listener();
}

export function connectionState(): Connection {
    return current;
}

// The event stream, which tells the state, takes the requests to check it.
export function setConnectionHandlers(next: Handlers | undefined) {
    handlers = next;
}

export function flashConnectionBanner() {
    updateConnection({ flashes: current.flashes + 1 });
}

export function retryConnection() {
    handlers?.retry();
}

// A request that found no player: the stream is checked at once.
export function reportConnectionFailure() {
    handlers?.failed();
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function useConnection(): Connection {
    return useSyncExternalStore(subscribe, connectionState, () => initial);
}

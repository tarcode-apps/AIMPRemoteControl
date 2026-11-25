import { useSyncExternalStore } from 'react';

// The Android app that shows the client in its web view; docs/android-bridge.md is
// the contract. The app gives the page `window.aimpRemoteControlApp` before any
// script of the page runs. The client greets it, and the answer names what the app
// can be asked for: an app older than the client names less, and is asked for no more.
export type AppFeature = 'disconnect' | 'api';

// A message of either side: a JSON object with a `type`.
export type AppMessage = { type: string; [field: string]: unknown };

type Bridge = {
    postMessage(message: string): void;
    onmessage: ((event: { data: string }) => void) | null;
};

declare global {
    interface Window {
        aimpRemoteControlApp?: Bridge;
    }
}

// The app reads no message longer than this, in characters.
const maxAppMessageLength = 1024 * 1024;

const none: readonly string[] = [];
let features = none;
const listeners = new Set<() => void>();
const handlers = new Map<string, Set<(message: AppMessage) => void>>();

const bridge = typeof window === 'undefined' ? undefined : window.aimpRemoteControlApp;

// False when the message is longer than the app reads: it was not sent.
export function sendToApp(message: AppMessage): boolean {
    const text = JSON.stringify(message);
    if (text.length > maxAppMessageLength) return false;
    bridge?.postMessage(text);
    return true;
}

// Hears the app's messages of one type; returns what ends it.
export function onAppMessage(type: string, handler: (message: AppMessage) => void): () => void {
    const ofType = handlers.get(type) ?? new Set();
    handlers.set(type, ofType);
    ofType.add(handler);
    return () => ofType.delete(handler);
}

// What the app can be asked for, once it has answered the greeting; nothing in a
// browser. The app is greeted as the client loads, whatever is on the screen: by
// the greeting the app knows the page for the client, which decides what its Back
// does, and by the answer the client knows how to reach the player.
export const appFeatures: Promise<readonly string[]> = new Promise(resolve => {
    if (!bridge) {
        resolve(none);
        return;
    }
    bridge.onmessage = event => {
        const message = JSON.parse(event.data) as AppMessage;
        // An app newer than the client may say what the client does not know yet.
        for (const handler of handlers.get(message.type) ?? []) handler(message);
    };
    onAppMessage('hello', message => {
        features = message.features as string[];
        resolve(features);
        for (const listener of listeners) listener();
    });
    sendToApp({ type: 'hello' });
});

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

// Whether the client runs in the app, and the app can be asked for this.
export function useAppFeature(feature: AppFeature): boolean {
    return useSyncExternalStore(
        subscribe,
        () => features.includes(feature),
        () => false,
    );
}

// The app keeps several players and is connected to one: it leaves this one for
// its list of them, and the page goes with it.
export function disconnect() {
    sendToApp({ type: 'disconnect' });
}

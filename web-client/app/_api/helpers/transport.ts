import { appFeatures } from '@/app/_utils/androidApp';
import { appTransport } from './appTransport';
import { browserTransport } from './browserTransport';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type Answer = { status: number; contentType: string | null; text: string };

// `url` is where the request ended, after the server's redirects.
export type LoadedFile = { status: number; url: string; blob: Blob };

export type EventListener = {
    // The stream is open: at first, and again after each loss.
    opened(): void;
    // An event, its data as the player sent it.
    event(name: string, data: string): void;
};

// The way to the player's API. A browser asks the player itself; in the Android
// app the page asks the app, which holds the login and the one stream of events
// (docs/android-bridge.md). Whichever it is, it also keeps connection.ts told.
export type Transport = {
    // `path` from the root, with its query; `body` is JSON. Rejects when no answer
    // came, and with an AbortError when cancelled.
    send(method: HttpMethod, path: string, body?: string, signal?: AbortSignal): Promise<Answer>;
    // A file of the API, which is an image; the same rejections.
    load(path: string, signal?: AbortSignal): Promise<LoadedFile>;
    // Hears the events of these names for as long as the page lives, through every
    // loss of the player; returns what ends it.
    listen(names: string[], listener: EventListener): () => void;
};

// Known once the app has answered the greeting; at once in a browser.
export const transport: Promise<Transport> = appFeatures.then(features =>
    features.includes('api') ? appTransport : browserTransport,
);

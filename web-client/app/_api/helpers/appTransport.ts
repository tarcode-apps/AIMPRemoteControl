import { onAppMessage, sendToApp } from '@/app/_utils/androidApp';
import { connectionState, setConnectionHandlers, updateConnection } from './connection';
import type { HttpMethod, Transport } from './transport';

// What the app answers a request with: the player's answer, its body as text or,
// for a file, in base64; or why there is none.
type ResponseMessage = {
    id: number;
    status: number;
    contentType: string | null;
    url: string;
    body?: string;
    base64?: string;
    error?: string;
};

let lastId = 0;
const waiting = new Map<number, (response: ResponseMessage) => void>();

onAppMessage('response', message => {
    const response = message as unknown as ResponseMessage;
    const settle = waiting.get(response.id);
    waiting.delete(response.id);
    settle?.(response);
});

const cancelled = () => new DOMException('The request was cancelled', 'AbortError');
const tooLong: ResponseMessage = { id: 0, status: 413, contentType: null, url: '', body: '' };

function ask(
    request: { method: HttpMethod; path: string; body?: string; file?: boolean },
    signal?: AbortSignal,
): Promise<ResponseMessage> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(cancelled());
            return;
        }
        const id = ++lastId;
        // The player would refuse a body of this length as well.
        if (!sendToApp({ type: 'request', id, ...request })) {
            resolve(tooLong);
            return;
        }
        const abort = () => {
            waiting.delete(id);
            sendToApp({ type: 'abort', id });
            reject(cancelled());
        };
        signal?.addEventListener('abort', abort, { once: true });
        waiting.set(id, response => {
            signal?.removeEventListener('abort', abort);
            // The app got no answer from the player, or would not ask it.
            if (response.error !== undefined) reject(new Error(`No answer through the app: ${response.error}`));
            else resolve(response);
        });
    });
}

function bytes(base64: string): Uint8Array<ArrayBuffer> {
    const binary = atob(base64);
    const result = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) result[i] = binary.charCodeAt(i);
    return result;
}

export const appTransport: Transport = {
    async send(method, path, body, signal) {
        const { status, contentType, body: text = '' } = await ask({ method, path, body }, signal);
        return { status, contentType, text };
    },

    async load(path, signal) {
        const { status, contentType, url, base64 = '' } = await ask({ method: 'GET', path, file: true }, signal);
        return { status, url, blob: new Blob([bytes(base64)], { type: contentType ?? '' }) };
    },

    // The stream is the app's, open whether the page is there or not, and so are
    // the retries and what the banner is told: the page hears of both.
    listen(names, listener) {
        const wanted = new Set(names);
        const stop = [
            onAppMessage('open', () => listener.opened()),
            onAppMessage('event', ({ name, data }) => {
                if (wanted.has(name as string)) listener.event(name as string, data as string);
            }),
            onAppMessage('connection', ({ online, checking, closed, retryAt }) =>
                updateConnection({
                    online: online as boolean,
                    checking: checking as boolean,
                    closed: closed as boolean,
                    retryAt: retryAt as number | null,
                    lostAt: online ? null : (connectionState().lostAt ?? performance.now()),
                }),
            ),
        ];
        setConnectionHandlers({
            retry: () => sendToApp({ type: 'retry' }),
            // The app makes the requests, and knows of one that found no player.
            failed: () => {},
        });
        sendToApp({ type: 'events', listen: true });

        return () => {
            sendToApp({ type: 'events', listen: false });
            setConnectionHandlers(undefined);
            for (const end of stop) end();
        };
    },
};

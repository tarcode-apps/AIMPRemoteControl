import { connectionState, setConnectionHandlers, updateConnection } from './connection';
import type { EventListener, Transport } from './transport';

// The server pings after 30 s without events; a stream silent for longer than
// two of those is dead, whatever the browser says of it: a sleeping mobile
// loses its connections without a word.
const silenceLimit = 75_000;
// The first retry as the server's `retry:` hint, which only the browser's own
// reconnection obeys; each failure in a row doubles it, up to the cap.
const firstRetryDelay = 3000;
const maxRetryDelay = 30_000;
// A stream that drops and opens again within this is no news to the user.
const lossGrace = 2500;
// Back from the background, a mobile takes a few seconds to bring its network
// up again: for this long a failure is no loss yet, and the stream is retried
// often, so that it is back as soon as the network is.
const wakeWindow = 5000;
const wakeRetryDelay = 500;
// A timer this late slept with the page.
const sleepSlack = 1000;

// The Android app keeps a stream of its own by the same rules: PlayerConnection.kt.
function listen(names: string[], listener: EventListener): () => void {
    let source: EventSource | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let heardAt = 0;
    let failures = 0;
    let lossTimer: ReturnType<typeof setTimeout> | undefined;
    let wakeUntil = 0;

    const wake = () => {
        wakeUntil = Date.now() + wakeWindow;
    };
    const waking = () => Date.now() < wakeUntil;
    // Timers stand still while a mobile sleeps, and those due fire as it wakes,
    // before or after the page hears it is visible again.
    const after = (delay: number, action: () => void) => {
        const due = Date.now() + delay;
        return setTimeout(() => {
            if (Date.now() > due + sleepSlack) wake();
            action();
        }, delay);
    };

    const goOffline = (closed = false) => {
        clearTimeout(lossTimer);
        lossTimer = undefined;
        if (connectionState().online)
            updateConnection({ online: false, checking: false, closed, lostAt: performance.now() });
    };
    // Shows the loss once `delay` and the wake window are both over.
    const armLoss = (delay: number) => {
        lossTimer = after(Math.max(delay, wakeUntil - Date.now()), () => {
            lossTimer = undefined;
            if (waking()) armLoss(0);
            else goOffline();
        });
    };
    const lost = () => {
        if (!connectionState().online || lossTimer !== undefined) return;
        armLoss(lossGrace);
        updateConnection({ checking: true });
    };

    const reconnect = (delay: number) => {
        source?.close();
        source = undefined;
        clearTimeout(timer);
        timer = after(delay, connect);
        lost();
        updateConnection({ retryAt: delay > 0 ? Date.now() + delay : null });
    };

    const heard = () => {
        heardAt = Date.now();
        clearTimeout(timer);
        timer = after(silenceLimit, () => reconnect(0));
    };

    const connect = () => {
        source = new EventSource('/api/v1/events');
        heard();
        updateConnection({ retryAt: null });
        const on = (name: string, handler: (data: string) => void) =>
            source!.addEventListener(name, (event: MessageEvent<string>) => {
                heard();
                handler(event.data);
            });

        source.onopen = () => {
            heard();
            failures = 0;
            clearTimeout(lossTimer);
            lossTimer = undefined;
            updateConnection({ online: true, checking: false, closed: false, retryAt: null, lostAt: null });
            listener.opened();
        };
        // The browser reopens a dropped stream by itself, but gives up for good on
        // an answer that is no stream, such as a proxy's 500 while the player
        // restarts; one path for both.
        source.onerror = () =>
            reconnect(waking() ? wakeRetryDelay : Math.min(firstRetryDelay * 2 ** failures++, maxRetryDelay));
        on('ping', () => {});
        on('shutdown', () => goOffline(true));
        for (const name of names) on(name, data => listener.event(name, data));
    };

    // By the clock, which does not sleep with the page: a retry still waiting
    // out its delay is not worth the wait once the page is back.
    const checkSilence = () => {
        if (!source || Date.now() - heardAt > silenceLimit) reconnect(0);
    };
    const onVisibilityChange = () => {
        if (document.visibilityState !== 'visible') return;
        wake();
        checkSilence();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', checkSilence);
    setConnectionHandlers({
        retry: () => reconnect(0),
        // Once the loss is shown, the retries go on by their own clock; just
        // awake, it waits for the wake window.
        failed: () => {
            if (!connectionState().online) return;
            if (!waking()) goOffline();
            reconnect(0);
        },
    });
    connect();

    return () => {
        setConnectionHandlers(undefined);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('online', checkSilence);
        clearTimeout(timer);
        clearTimeout(lossTimer);
        source?.close();
    };
}

export const browserTransport: Transport = {
    async send(method, path, body, signal) {
        const response = await fetch(path, {
            method,
            headers: {
                Accept: 'application/json',
                ...(body !== undefined && { 'Content-Type': 'application/json' }),
            },
            body,
            signal,
            cache: 'no-store',
        });
        return {
            status: response.status,
            contentType: response.headers.get('Content-Type'),
            text: await response.text(),
        };
    },

    async load(path, signal) {
        const response = await fetch(path, { signal });
        return { status: response.status, url: response.url || path, blob: await response.blob() };
    },

    listen,
};

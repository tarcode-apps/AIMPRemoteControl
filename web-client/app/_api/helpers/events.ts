import { receiveAbout, type About } from '@/app/_api/about';
import { receiveEffects } from '@/app/_api/effects';
import { favoriteKeys } from '@/app/_api/favorites';
import { playerKeys, snapshot } from '@/app/_api/player';
import { playlistKeys } from '@/app/_api/playlists';
import { queueKeys } from '@/app/_api/queue';
import { searchKeys } from '@/app/_api/search';
import { settingsKeys } from '@/app/_api/settings';
import { timerKeys } from '@/app/_api/timer';
import type { EffectsState, PlayerState, Playlist, Queue, TimerState } from '@/app/_api/types';
import { favoriteRecords } from '@/app/_state/Favorites';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';
import { connectionState, setConnectionHandlers, updateConnection } from './connection';

type PlaylistsChanged = { playlists: { id: string; revision: number }[] };

const invalidations: Record<string, QueryKey> = {
    queue: queueKeys.all,
    settings: settingsKeys.all,
};

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

// Kept outside React on purpose: it must survive remounts and die with the page,
// so a differing version on reconnect can only mean the plugin was replaced.
let knownPluginVersion: string | undefined;

function invalidateChangedPlaylists(client: QueryClient, { playlists }: PlaylistsChanged) {
    const known = new Map(client.getQueryData<Playlist[]>(playlistKeys.all)?.map(p => [p.id, p.revision]));
    client.invalidateQueries({ queryKey: playlistKeys.all, exact: true });
    const changed = new Set<string>();
    for (const { id, revision } of playlists) {
        if (known.get(id) !== revision) {
            client.invalidateQueries({ queryKey: playlistKeys.playlist(id) });
            changed.add(id);
        }
        known.delete(id);
    }
    for (const id of known.keys()) {
        client.removeQueries({ queryKey: playlistKeys.playlist(id) });
        changed.add(id);
    }
    // Queued items point at playlist indexes.
    const queue = client.getQueryData<Queue>(queueKeys.all);
    if (queue?.items.some(item => changed.has(item.playlistId))) client.invalidateQueries({ queryKey: queueKeys.all });
    // A search spans every playlist, a new one included.
    if (changed.size) client.invalidateQueries({ queryKey: searchKeys.all });
    // A favorite is looked for in its own playlist only.
    if (favoriteRecords().some(record => changed.has(record.playlistId)))
        client.invalidateQueries({ queryKey: favoriteKeys.all });
}

export function useEventStream(client: QueryClient) {
    useEffect(() => {
        let source: EventSource | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let heardAt = 0;
        let opened = false;
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
            const on = <T>(name: string, handler: (data: T) => void) =>
                source!.addEventListener(name, (event: MessageEvent<string>) => {
                    heard();
                    handler(JSON.parse(event.data) as T);
                });

            source.onopen = () => {
                heard();
                failures = 0;
                clearTimeout(lossTimer);
                lossTimer = undefined;
                updateConnection({ online: true, checking: false, closed: false, retryAt: null, lostAt: null });
                if (opened) client.invalidateQueries();
                opened = true;
            };
            // The browser reopens a dropped stream by itself, but gives up for good on
            // an answer that is no stream, such as a proxy's 500 while the player
            // restarts; one path for both.
            source.onerror = () =>
                reconnect(waking() ? wakeRetryDelay : Math.min(firstRetryDelay * 2 ** failures++, maxRetryDelay));
            on<About>('hello', about => {
                if (knownPluginVersion !== undefined && knownPluginVersion !== about.pluginVersion) location.reload();
                knownPluginVersion = about.pluginVersion;
                receiveAbout(about);
            });
            on<PlaylistsChanged>('playlists', data => invalidateChangedPlaylists(client, data));
            on<PlayerState>('player', data => client.setQueryData(playerKeys.state, snapshot(data)));
            on<TimerState>('timer', data => client.setQueryData(timerKeys.all, data));
            on<EffectsState>('effects', data => receiveEffects(client, data));
            on('ping', () => {});
            on('shutdown', () => goOffline(true));
            for (const [name, queryKey] of Object.entries(invalidations))
                on(name, () => client.invalidateQueries({ queryKey }));
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
    }, [client]);
}

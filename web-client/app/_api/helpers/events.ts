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

type Hello = { pluginVersion: string };
type PlaylistsChanged = { playlists: { id: string; revision: number }[] };

const invalidations: Record<string, QueryKey> = {
    queue: queueKeys.all,
    settings: settingsKeys.all,
};

// The server pings after 30 s without events; a stream silent for longer than
// two of those is dead, whatever the browser says of it: a sleeping mobile
// loses its connections without a word.
const silenceLimit = 75_000;
// As the server's `retry:` hint, which only the browser's own reconnection obeys.
const retryDelay = 3000;

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

        const reconnect = (delay: number) => {
            source?.close();
            source = undefined;
            clearTimeout(timer);
            timer = setTimeout(connect, delay);
        };

        const heard = () => {
            heardAt = Date.now();
            clearTimeout(timer);
            timer = setTimeout(() => reconnect(0), silenceLimit);
        };

        const connect = () => {
            source = new EventSource('/api/v1/events');
            heard();
            const on = <T>(name: string, handler: (data: T) => void) =>
                source!.addEventListener(name, (event: MessageEvent<string>) => {
                    heard();
                    handler(JSON.parse(event.data) as T);
                });

            source.onopen = () => {
                heard();
                if (opened) client.invalidateQueries();
                opened = true;
            };
            // The browser reopens a dropped stream by itself, but gives up for good on
            // an answer that is no stream, such as a proxy's 500 while the player
            // restarts; one path for both.
            source.onerror = () => reconnect(retryDelay);
            on<Hello>('hello', ({ pluginVersion }) => {
                if (knownPluginVersion !== undefined && knownPluginVersion !== pluginVersion) location.reload();
                knownPluginVersion = pluginVersion;
            });
            on<PlaylistsChanged>('playlists', data => invalidateChangedPlaylists(client, data));
            on<PlayerState>('player', data => client.setQueryData(playerKeys.state, snapshot(data)));
            on<TimerState>('timer', data => client.setQueryData(timerKeys.all, data));
            on<EffectsState>('effects', data => receiveEffects(client, data));
            on('ping', () => {});
            for (const [name, queryKey] of Object.entries(invalidations))
                on(name, () => client.invalidateQueries({ queryKey }));
        };

        // Timers stand still while a mobile sleeps; the clock does not.
        const checkSilence = () => {
            if (Date.now() - heardAt > silenceLimit) reconnect(0);
        };
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') checkSilence();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('online', checkSilence);
        connect();

        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('online', checkSilence);
            clearTimeout(timer);
            source?.close();
        };
    }, [client]);
}

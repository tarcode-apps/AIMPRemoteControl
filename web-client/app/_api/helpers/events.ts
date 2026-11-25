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
import { transport } from './transport';

type PlaylistsChanged = { playlists: { id: string; revision: number }[] };

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

// The player's events, through every loss of it; the transport keeps the stream
// and tells connection.ts of its state.
export function useEventStream(client: QueryClient) {
    useEffect(() => {
        const invalidate = (queryKey: QueryKey) => () => void client.invalidateQueries({ queryKey });
        const handlers: Record<string, (data: never) => void> = {
            hello: (about: About) => {
                if (knownPluginVersion !== undefined && knownPluginVersion !== about.pluginVersion) location.reload();
                knownPluginVersion = about.pluginVersion;
                receiveAbout(about);
            },
            playlists: (data: PlaylistsChanged) => invalidateChangedPlaylists(client, data),
            player: (data: PlayerState) => client.setQueryData(playerKeys.state, snapshot(data)),
            timer: (data: TimerState) => client.setQueryData(timerKeys.all, data),
            effects: (data: EffectsState) => receiveEffects(client, data),
            queue: invalidate(queueKeys.all),
            settings: invalidate(settingsKeys.all),
        };

        let opened = false;
        let ended = false;
        let end: (() => void) | undefined;
        void transport.then(({ listen }) => {
            if (ended) return;
            end = listen(Object.keys(handlers), {
                // Whatever changed while the stream was down went unheard.
                opened() {
                    if (opened) void client.invalidateQueries();
                    opened = true;
                },
                event: (name, data) => handlers[name](JSON.parse(data) as never),
            });
        });

        return () => {
            ended = true;
            end?.();
        };
    }, [client]);
}

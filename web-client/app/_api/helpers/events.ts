import { favoriteKeys } from '@/app/_api/favorites';
import { playerKeys, snapshot } from '@/app/_api/player';
import { playlistKeys } from '@/app/_api/playlists';
import { queueKeys } from '@/app/_api/queue';
import { searchKeys } from '@/app/_api/search';
import type { PlayerState, Playlist, Queue } from '@/app/_api/types';
import { favoriteRecords } from '@/app/_state/Favorites';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';

type Hello = { pluginVersion: string };
type PlaylistsChanged = { playlists: { id: string; revision: number }[] };

const invalidations: Record<string, QueryKey> = {
    queue: queueKeys.all,
    timer: ['timer'],
};

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
        const source = new EventSource('/api/v1/events');
        let reconnecting = false;

        source.onopen = () => {
            if (reconnecting) client.invalidateQueries();
            reconnecting = true;
        };
        source.addEventListener('hello', (event: MessageEvent<string>) => {
            const { pluginVersion } = JSON.parse(event.data) as Hello;
            if (knownPluginVersion !== undefined && knownPluginVersion !== pluginVersion) location.reload();
            knownPluginVersion = pluginVersion;
        });
        source.addEventListener('playlists', (event: MessageEvent<string>) => {
            invalidateChangedPlaylists(client, JSON.parse(event.data) as PlaylistsChanged);
        });
        source.addEventListener('player', (event: MessageEvent<string>) => {
            client.setQueryData(playerKeys.state, snapshot(JSON.parse(event.data) as PlayerState));
        });
        for (const [name, queryKey] of Object.entries(invalidations))
            source.addEventListener(name, () => client.invalidateQueries({ queryKey }));

        return () => source.close();
    }, [client]);
}

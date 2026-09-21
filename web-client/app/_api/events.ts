import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';
import { playerKeys, snapshot } from './player';
import { playlistKeys } from './playlists';
import type { PlayerState, Playlist } from './types';

type Hello = { pluginVersion: string };
type PlaylistsChanged = { playlists: { id: string; revision: number }[] };

const invalidations: Record<string, QueryKey> = {
    queue: ['queue'],
    timer: ['timer'],
};

// Kept outside React on purpose: it must survive remounts and die with the page,
// so a differing version on reconnect can only mean the plugin was replaced.
let knownPluginVersion: string | undefined;

function invalidateChangedPlaylists(client: QueryClient, { playlists }: PlaylistsChanged) {
    const known = new Map(client.getQueryData<Playlist[]>(playlistKeys.all)?.map(p => [p.id, p.revision]));
    client.invalidateQueries({ queryKey: playlistKeys.all, exact: true });
    for (const { id, revision } of playlists) {
        if (known.get(id) !== revision) client.invalidateQueries({ queryKey: playlistKeys.playlist(id) });
        known.delete(id);
    }
    for (const id of known.keys()) client.removeQueries({ queryKey: playlistKeys.playlist(id) });
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

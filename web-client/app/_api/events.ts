import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';
import { playlistKeys } from './playlists';

type Hello = { pluginVersion: string };

const invalidations: Record<string, QueryKey> = {
    player: ['player'],
    playlists: playlistKeys.all,
    queue: ['queue'],
    timer: ['timer'],
};

// Kept outside React on purpose: it must survive remounts and die with the page,
// so a differing version on reconnect can only mean the plugin was replaced.
let knownPluginVersion: string | undefined;

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
        for (const [name, queryKey] of Object.entries(invalidations))
            source.addEventListener(name, () => client.invalidateQueries({ queryKey }));

        return () => source.close();
    }, [client]);
}

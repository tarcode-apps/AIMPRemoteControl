import { playlistItemsQuery, usePlaylistGroups } from '@/app/_api/playlists';
import type { Playlist } from '@/app/_api/types';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { PlaylistRows } from './playlistRows';

export const pageSize = 200;

// The rows of a playlist, or of its search results when `text` is not empty.
export function usePlaylistLayout(playlist: Playlist, text: string) {
    const searching = text !== '';
    const grouped = playlist.grouping.enabled;
    const groupsQuery = usePlaylistGroups(playlist.id, grouped, text);
    const groups = grouped ? groupsQuery.data?.groups : undefined;
    const firstResults = useQuery({
        ...playlistItemsQuery(playlist.id, { offset: 0, limit: pageSize, search: text }),
        enabled: searching && !grouped,
    });

    let total: number | undefined = playlist.itemCount;
    if (searching) total = grouped ? groups?.reduce((sum, group) => sum + group.count, 0) : firstResults.data?.total;

    // Results are shown in full whatever the player's collapsed state.
    const layoutGroups = useMemo(
        () => (searching ? groups?.map(group => ({ ...group, expanded: true })) : groups),
        [groups, searching],
    );
    const rows = useMemo(() => new PlaylistRows(total ?? 0, layoutGroups), [total, layoutGroups]);

    return {
        rows,
        pending: total === undefined,
        queries: [groupsQuery, firstResults],
    };
}

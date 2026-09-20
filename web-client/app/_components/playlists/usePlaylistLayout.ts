import { playlistItemsQuery, usePlaylistGroups } from '@/app/_api/playlists';
import type { Playlist } from '@/app/_api/types';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { PlaylistRows } from './playlistRows';

export const pageSize = 200;

// The rows of a playlist, or of its search results when `text` is not empty. With
// `expandAll` every group is laid out expanded whatever its state in the player.
export function usePlaylistLayout(playlist: Playlist, text: string, expandAll: boolean) {
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

    const layoutGroups = useMemo(
        () => (expandAll ? groups?.map(group => ({ ...group, expanded: true })) : groups),
        [groups, expandAll],
    );
    const rows = useMemo(() => new PlaylistRows(total ?? 0, layoutGroups), [total, layoutGroups]);

    return {
        rows,
        pending: total === undefined,
        groupsRevision: groupsQuery.data?.revision,
        queries: [groupsQuery, firstResults],
    };
}

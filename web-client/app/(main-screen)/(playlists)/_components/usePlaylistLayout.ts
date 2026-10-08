import { playlistItemsQuery, usePlaylistGroups } from '@/app/_api/playlists';
import type { ItemsSummary, Playlist } from '@/app/_api/types';
import { pageSize, PlaylistRows } from '@/app/_components/lists';
import { sumSummaries } from '@/app/_utils/summary';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

// What a playlist shows of itself, or of its matches when `text` is not empty: its
// groups and the totals of the whole list. The layout and the heading share it.
export function usePlaylistView(playlist: Playlist | undefined, text: string) {
    const id = playlist?.id ?? '';
    const searching = text !== '';
    const grouped = playlist?.grouping.enabled ?? false;
    const groupsQuery = usePlaylistGroups(id, grouped, text);
    const groups = grouped ? groupsQuery.data?.groups : undefined;
    const firstResults = useQuery({
        ...playlistItemsQuery(id, { offset: 0, limit: pageSize, search: text }),
        enabled: playlist !== undefined && searching && !grouped,
    });

    let totals: ItemsSummary | undefined;
    if (playlist && !searching)
        totals = { count: playlist.itemCount, duration: playlist.duration, size: playlist.size };
    else if (grouped) totals = groups && sumSummaries(groups);
    else if (firstResults.data) {
        const { total, duration = 0, size = 0 } = firstResults.data;
        totals = { count: total, duration, size };
    }

    return { groups, totals, groupsQuery, firstResults };
}

// The rows of a playlist, or of its search results when `text` is not empty. With
// `expandAll` every group is laid out expanded whatever its state in the player,
// otherwise as `folding` has it, by group index, or as in the player.
export function usePlaylistLayout(
    playlist: Playlist,
    text: string,
    expandAll: boolean,
    folding: ReadonlyMap<number, boolean>,
) {
    const { groups, totals, groupsQuery, firstResults } = usePlaylistView(playlist, text);
    const total = totals?.count;

    const layoutGroups = useMemo(
        () =>
            expandAll || folding.size
                ? groups?.map(group => ({
                      ...group,
                      expanded: expandAll || (folding.get(group.index) ?? group.expanded),
                  }))
                : groups,
        [groups, expandAll, folding],
    );
    const rows = useMemo(() => new PlaylistRows(total ?? 0, layoutGroups), [total, layoutGroups]);

    return {
        rows,
        // A grouped playlist's rows are not its own until the groups are known.
        pending: total === undefined || (playlist.grouping.enabled && groups === undefined),
        groupsRevision: groupsQuery.data?.revision,
        queries: [groupsQuery, firstResults],
    };
}

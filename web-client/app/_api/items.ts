import { useDebouncedValue } from '@/app/_hooks/useDebouncedValue';
import { noItems, sameSummary } from '@/app/_utils/summary';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { predict, revert, type Prediction } from './helpers/optimistic';
import { request } from './helpers/request';
import { groupByPlaylist, playlistKeys, type ItemsRange } from './playlists';
import type {
    ItemDetailsResponse,
    ItemsEnabledRequest,
    ItemsSelection,
    ItemsSummary,
    PlaylistGroups,
    PlaylistItemsPage,
    RemoveItemsRequest,
} from './types';

export const itemKeys = {
    summary: (key: string) => ['items', 'summary', key] as const,
};

// A track of some playlist, at the revision its index belongs to.
export type TrackRef = {
    playlistId: string;
    index: number;
    revision?: number;
};

// Tracks the client holds, as a selection by playlist, in the order of the first
// of each.
export function selectionOfTracks(tracks: Iterable<TrackRef>): ItemsSelection {
    return {
        playlists: [...groupByPlaylist(tracks)].map(([playlistId, group]) => ({
            playlistId,
            revision: group[0].revision,
            indexes: group.map(track => track.index),
        })),
    };
}

// Whether the ranges hold the span `first..last` whole.
function coveredBy(ranges: [number, number][]) {
    return (first: number, last: number) => ranges.some(([from, to]) => first >= from && last <= to);
}

// The switches are drawn ahead of the player, which reports the change through
// the `playlists` event only after its change filter has settled: the groups the
// ranges take whole, so that a group's switch does not show up empty meanwhile,
// and the rows of the loaded pages, so that they agree with their group's switch.
export function useSetItemsEnabled() {
    const client = useQueryClient();
    type Covered = ReturnType<typeof coveredBy>;

    // The groups of the list the ranges count: the playlist's own, or its search's.
    const predictGroups = (playlistId: string, search: string, covered: Covered, enabled: boolean) => {
        const key = playlistKeys.groupsView(playlistId, search);
        const groups = client.getQueryData<PlaylistGroups>(key);
        if (!groups) return [];
        const predicted = groups.groups.map(group =>
            covered(group.firstPosition, group.firstPosition + group.count - 1)
                ? { ...group, enabledCount: enabled ? group.count : 0 }
                : group,
        );
        return [predict(client, key, groups, { ...groups, groups: predicted })];
    };
    // The pages of the plain list, whose positions are the indexes.
    const predictRows = (playlistId: string, covered: Covered, enabled: boolean) => {
        const predictions: Prediction[] = [];
        const pages = client.getQueriesData<PlaylistItemsPage>({ queryKey: playlistKeys.itemPages(playlistId) });
        for (const [queryKey, page] of pages) {
            if (!page || (queryKey[3] as ItemsRange).search) continue;
            const items = page.items.map(item =>
                item.enabled !== enabled && covered(item.index, item.index) ? { ...item, enabled } : item,
            );
            if (items.some((item, i) => item !== page.items[i]))
                predictions.push(predict(client, queryKey, page, { ...page, items }));
        }
        return predictions;
    };

    return useMutation({
        mutationFn: (body: ItemsEnabledRequest) => request<unknown>('POST', '/items/enabled', { body }),
        onMutate: async ({ search = '', fields, playlists, enabled }) => {
            const predictions: Prediction[] = [];
            // Only a playlist's own list is cached by the positions the ranges count:
            // the extended search's are not, and indexes come from no list with switches.
            if (fields) return predictions;
            for (const selection of playlists) {
                if (!('ranges' in selection)) continue;
                const covered = coveredBy(selection.ranges);
                await client.cancelQueries({ queryKey: playlistKeys.playlist(selection.playlistId) });
                predictions.push(...predictGroups(selection.playlistId, search, covered, enabled));
                if (search === '') predictions.push(...predictRows(selection.playlistId, covered, enabled));
            }
            return predictions;
        },
        onError: (_error, _variables, predictions) => revert(client, predictions ?? []),
    });
}

// Not predicted: the pages are windows over the playlists, which the `playlists`
// event reloads once the player has taken the items out.
export function useRemoveItems() {
    return useMutation({
        mutationFn: (body: RemoveItemsRequest) => request<unknown>('POST', '/items/remove', { body }),
    });
}

export function useItemDetails() {
    return useMutation({
        mutationFn: (body: ItemsSelection) => request<ItemDetailsResponse>('POST', '/items/details', { body }),
    });
}

// What a selection amounts to: `known` when the caller has it, as with everything
// selected, else summed up by the player, asked a moment after the selection
// settles. Until the player answers, the value last shown stands in, so that the
// figures never go away while the selection changes; without a selection nothing
// is selected.
export function useSelectionSummary(selection: ItemsSelection | undefined, known?: ItemsSummary): ItemsSummary {
    const key = selection && !known ? JSON.stringify(selection) : '';
    const settled = useDebouncedValue(key, 150);
    const { data } = useQuery({
        queryKey: itemKeys.summary(settled),
        queryFn: ({ signal }) => request<ItemsSummary>('POST', '/items/summary', { body: JSON.parse(settled), signal }),
        enabled: settled !== '',
    });
    const [shown, setShown] = useState(noItems);
    const current = known ?? (selection ? data : noItems);
    if (current && !sameSummary(current, shown)) setShown(current);
    return current ?? shown;
}

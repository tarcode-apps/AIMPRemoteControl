import {
    queryOptions,
    useMutation,
    useQueries,
    useQuery,
    useQueryClient,
    type QueryClient,
} from '@tanstack/react-query';
import { isPrediction, predict, revert, useOptimisticMutation, type Prediction } from './helpers/optimistic';
import { request } from './helpers/request';
import { playerKeys, type PlayerSnapshot } from './player';
import { trackKey } from './queue';
import type {
    CreatedPlaylist,
    ItemDetailsResponse,
    ItemMarkRequest,
    ItemSelection,
    MoveRequest,
    Playlist,
    PlaylistGroups,
    PlaylistItemsPage,
    PlaylistRename,
    SortRequest,
} from './types';

export type ItemsRange = {
    offset: number;
    limit: number;
    search?: string;
};

// An empty search must share the cache key of no search.
const normalize = ({ offset, limit, search }: ItemsRange): ItemsRange =>
    search ? { offset, limit, search } : { offset, limit };

export const playlistKeys = {
    all: ['playlists'] as const,
    playlist: (id: string) => ['playlists', id] as const,
    itemPages: (id: string) => ['playlists', id, 'items'] as const,
    items: (id: string, range: ItemsRange) => ['playlists', id, 'items', range] as const,
    groups: (id: string) => ['playlists', id, 'groups'] as const,
    groupsView: (id: string, search: string) => ['playlists', id, 'groups', search] as const,
};

function searchParam(search: string | undefined) {
    return search ? `&search=${encodeURIComponent(search)}` : '';
}

export function usePlaylists() {
    return useQuery({
        queryKey: playlistKeys.all,
        queryFn: ({ signal }) => request<Playlist[]>('GET', '/playlists', { signal }),
    });
}

// Resolves once the list knows the new playlist, so that it can be selected.
export function useCreatePlaylist() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (name: string) => request<CreatedPlaylist>('POST', '/playlists', { body: { name } }),
        onSuccess: () => client.invalidateQueries({ queryKey: playlistKeys.all, exact: true }),
    });
}

// Not predicted for an empty name, which the player replaces with one of its own.
export function useRenamePlaylist() {
    return useOptimisticMutation<Playlist[], PlaylistRename>(
        playlistKeys.all,
        ({ id, name }) => request<unknown>('PATCH', `/playlists/${encodeURIComponent(id)}`, { body: { name } }),
        (playlists, { id, name }) =>
            name ? playlists.map(playlist => (playlist.id === id ? { ...playlist, name } : playlist)) : undefined,
    );
}

export function useRemovePlaylist() {
    return useOptimisticMutation<Playlist[], string>(
        playlistKeys.all,
        id => request<unknown>('DELETE', `/playlists/${encodeURIComponent(id)}`),
        (playlists, id) => playlists.filter(playlist => playlist.id !== id),
    );
}

export function playlistItemsQuery(id: string, unnormalized: ItemsRange) {
    const range = normalize(unnormalized);
    return queryOptions({
        queryKey: playlistKeys.items(id, range),
        queryFn: ({ signal }) =>
            request<PlaylistItemsPage>(
                'GET',
                `/playlists/${encodeURIComponent(id)}/items?offset=${range.offset}&limit=${range.limit}${searchParam(range.search)}`,
                { signal },
            ),
    });
}

export function usePlaylistItems(id: string, ranges: ItemsRange[]) {
    return useQueries({ queries: ranges.map(range => playlistItemsQuery(id, range)) });
}

export function usePlaylistGroups(id: string, enabled: boolean, search = '') {
    return useQuery({
        queryKey: playlistKeys.groupsView(id, search),
        queryFn: ({ signal }) =>
            request<PlaylistGroups>(
                'GET',
                `/playlists/${encodeURIComponent(id)}/groups?${searchParam(search).slice(1)}`,
                {
                    signal,
                },
            ),
        enabled,
    });
}

export type GroupExpansion = {
    index?: number;
    expanded: boolean;
    revision: number;
};

export function useSetGroupExpanded(id: string) {
    const client = useQueryClient();
    const key = playlistKeys.groups(id);
    return useMutation({
        mutationFn: ({ index, expanded, revision }: GroupExpansion) =>
            request<unknown>(
                'PATCH',
                `/playlists/${encodeURIComponent(id)}/groups${index === undefined ? '' : `/${index}`}`,
                { body: { expanded, revision } },
            ),
        onMutate: async ({ index, expanded }) => {
            await client.cancelQueries({ queryKey: key });
            const previous = client.getQueriesData<PlaylistGroups>({ queryKey: key });
            client.setQueriesData<PlaylistGroups>(
                { queryKey: key },
                data =>
                    data && {
                        ...data,
                        groups: data.groups.map(group =>
                            index === undefined || group.index === index ? { ...group, expanded } : group,
                        ),
                    },
            );
            return { previous };
        },
        onError: (_error, _variables, context) => {
            for (const [queryKey, data] of context?.previous ?? []) client.setQueryData(queryKey, data);
        },
    });
}

// The marks of a track once the player has the mark: its own rating as stars
// when the mark is taken away.
function predictedMarks(mark: number, rating: number) {
    return { mark, displayingMark: mark || rating * 5 };
}

function withPlayingMark(player: PlayerSnapshot, mark: number): PlayerSnapshot {
    return player.track
        ? { ...player, track: { ...player.track, ...predictedMarks(mark, player.track.rating) } }
        : player;
}

function withItemMark(page: PlaylistItemsPage, index: number, mark: number): PlaylistItemsPage {
    return {
        ...page,
        items: page.items.map(item =>
            item.index === index ? { ...item, ...predictedMarks(mark, item.rating) } : item,
        ),
    };
}

// The marks asked for one track are sent one after the other: in parallel they
// may reach the player in any order, and the last one asked for must be the one
// that stays. A mark overtaken by a later one before its turn is not sent, and
// the last one is kept in the cache until the player reports it, since the
// player's events echo the states on the way there.
const markQueues = new Map<string, Promise<void>>();
const wantedMarks = new Map<string, number>();
const holdingClients = new WeakSet<QueryClient>();

function holdWantedMarks(client: QueryClient) {
    if (holdingClients.has(client)) return;
    holdingClients.add(client);
    client.getQueryCache().subscribe(event => {
        if (event.type !== 'updated' || event.action.type !== 'success' || !wantedMarks.size) return;
        const data: unknown = event.action.data;
        if (!data || isPrediction(data)) return;
        const queryKey = event.query.queryKey;
        if (queryKey.length === 1 && queryKey[0] === playerKeys.state[0]) {
            const player = data as PlayerSnapshot;
            if (!player.track) return;
            const key = trackKey(player.track.playlistId, player.track.index);
            const wanted = wantedMarks.get(key);
            if (wanted === undefined) return;
            if (player.track.mark === wanted) wantedMarks.delete(key);
            else predict(client, queryKey, player, withPlayingMark(player, wanted));
        } else if (queryKey.length === 4 && queryKey[0] === 'playlists' && queryKey[2] === 'items') {
            const playlistId = queryKey[1] as string;
            const fetched = data as PlaylistItemsPage;
            let page = fetched;
            for (const item of page.items) {
                const key = trackKey(playlistId, item.index);
                const wanted = wantedMarks.get(key);
                if (wanted === undefined) continue;
                if (item.mark === wanted) wantedMarks.delete(key);
                else page = withItemMark(page, item.index, wanted);
            }
            if (page !== fetched) predict(client, queryKey, fetched, page);
        }
    });
}

function sendMark({ playlistId, index, mark }: ItemMarkRequest): Promise<void> {
    const key = trackKey(playlistId, index);
    wantedMarks.set(key, mark);
    const turn = async () => {
        if (wantedMarks.get(key) !== mark) return;
        await request<unknown>('PATCH', `/playlists/${encodeURIComponent(playlistId)}/items/${index}`, {
            body: { mark },
        });
    };
    const queued = (markQueues.get(key) ?? Promise.resolve()).catch(() => {}).then(turn);
    markQueues.set(key, queued);
    return queued;
}

// Shown at once in the rows and in the player; the player's own events follow.
export function useSetItemMark() {
    const client = useQueryClient();
    holdWantedMarks(client);
    return useMutation({
        mutationFn: sendMark,
        onMutate: async ({ playlistId, index, mark }) => {
            const pagesKey = playlistKeys.itemPages(playlistId);
            await client.cancelQueries({ queryKey: pagesKey });
            const predictions: Prediction[] = [];
            for (const [queryKey, page] of client.getQueriesData<PlaylistItemsPage>({ queryKey: pagesKey }))
                if (page) predictions.push(predict(client, queryKey, page, withItemMark(page, index, mark)));
            const player = client.getQueryData<PlayerSnapshot>(playerKeys.state);
            if (player?.track?.playlistId === playlistId && player.track.index === index)
                predictions.push(predict(client, playerKeys.state, player, withPlayingMark(player, mark)));
            return predictions;
        },
        onError: (_error, { playlistId, index, mark }, predictions) => {
            const key = trackKey(playlistId, index);
            if (wantedMarks.get(key) === mark) wantedMarks.delete(key);
            revert(client, predictions ?? []);
        },
    });
}

export function useSortPlaylist(id: string) {
    return useMutation({
        mutationFn: (body: SortRequest) =>
            request<unknown>('POST', `/playlists/${encodeURIComponent(id)}/sort`, { body }),
    });
}

export function useMovePlaylistItems(id: string) {
    return useMutation({
        mutationFn: (body: MoveRequest) =>
            request<unknown>('POST', `/playlists/${encodeURIComponent(id)}/items/move`, { body }),
    });
}

export type ItemDetailsRequest = ItemSelection & {
    playlistId: string;
    revision?: number;
};

export function useItemDetails() {
    return useMutation({
        mutationFn: ({ playlistId, ...body }: ItemDetailsRequest) =>
            request<ItemDetailsResponse>('POST', `/playlists/${encodeURIComponent(playlistId)}/items/details`, {
                body,
            }),
    });
}

// The tracks by playlist, the playlists in the order they first appear.
export function groupByPlaylist<T extends { playlistId: string }>(tracks: Iterable<T>): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const track of tracks) {
        const group = groups.get(track.playlistId);
        if (group) group.push(track);
        else groups.set(track.playlistId, [track]);
    }
    return groups;
}

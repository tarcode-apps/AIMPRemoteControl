import { queryOptions, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from './client';
import type { Playlist, PlaylistGroups, PlaylistItemsPage } from './types';

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

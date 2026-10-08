import { queryOptions, useQueries } from '@tanstack/react-query';
import { request } from './helpers/request';
import { searchFields, type SearchField, type SearchPage } from './types';

export type SearchParams = {
    search: string;
    fields: SearchField[];
    // The playlists to look through, in the player's order; null for all of them.
    playlists: string[] | null;
};

export type PageRange = {
    offset: number;
    limit: number;
};

export const searchKeys = {
    all: ['search'] as const,
    page: (params: SearchParams, range: PageRange) => ['search', params, range] as const,
};

// The fields in their canonical order, so that equal sets share a cache key.
export function normalizeFields(fields: readonly SearchField[]): SearchField[] {
    return searchFields.filter(field => fields.includes(field));
}

function searchUrl({ search, fields, playlists }: SearchParams, { offset, limit }: PageRange) {
    const query = new URLSearchParams({
        search,
        fields: fields.join(','),
        offset: String(offset),
        limit: String(limit),
    });
    if (playlists) query.set('playlists', playlists.join(','));
    return `/search?${query}`;
}

export function searchQuery(params: SearchParams, range: PageRange) {
    return queryOptions({
        queryKey: searchKeys.page(params, range),
        queryFn: ({ signal }) => request<SearchPage>('GET', searchUrl(params, range), { signal }),
    });
}

// Nothing is fetched without params.
export function useSearchPages(params: SearchParams | null, ranges: PageRange[]) {
    return useQueries({ queries: params ? ranges.map(range => searchQuery(params, range)) : [] });
}

import type { FavoriteRecord } from '@/app/_state/Favorites';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { request } from './helpers/request';
import type { LocateRequest, LocateResponse, LocatedItem } from './types';

export const favoriteKeys = {
    all: ['favorites'] as const,
    located: (keyParts: string[]) => ['favorites', 'located', keyParts] as const,
};

// Where each favorite is in its playlist now, by file; a favorite that is not
// there is absent. The previous answer stays on screen while a new one loads.
export function useLocatedFavorites(records: FavoriteRecord[]) {
    const requests = useMemo<LocateRequest[]>(
        () => records.map(({ fileUri, playlistId }) => ({ fileUri, playlistId })),
        [records],
    );
    const keyParts = useMemo(
        () => requests.map(({ fileUri, playlistId }) => `${playlistId}|${fileUri}`).sort(),
        [requests],
    );
    return useQuery({
        queryKey: favoriteKeys.located(keyParts),
        queryFn: ({ signal }) =>
            request<LocateResponse>('POST', '/playlists/locate', { body: { items: requests }, signal }),
        enabled: requests.length > 0,
        placeholderData: keepPreviousData,
        select: (data): ReadonlyMap<string, LocatedItem> => new Map(data.found.map(item => [item.fileUri, item])),
    });
}

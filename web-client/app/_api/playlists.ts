import { useQuery } from '@tanstack/react-query';
import { request } from './client';
import type { Playlist } from './types';

export const playlistKeys = {
    all: ['playlists'] as const,
};

export function usePlaylists() {
    return useQuery({
        queryKey: playlistKeys.all,
        queryFn: ({ signal }) => request<Playlist[]>('GET', '/playlists', { signal }),
    });
}

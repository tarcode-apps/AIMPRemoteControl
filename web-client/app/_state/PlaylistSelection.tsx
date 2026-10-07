'use client';

import { usePlayer } from '@/app/_api/player';
import { usePlaylists } from '@/app/_api/playlists';
import type { Playlist } from '@/app/_api/types';
import { createContext, useContext, useState, type ReactNode } from 'react';

export type PlaylistSelectionContextValue = {
    playlists: Playlist[] | undefined;
    selected: Playlist | undefined;
    select(id: string): void;
};

const PlaylistSelectionContext = createContext<PlaylistSelectionContextValue | null>(null);

export function usePlaylistSelection(): PlaylistSelectionContextValue {
    const value = useContext(PlaylistSelectionContext);
    if (!value) throw new Error('usePlaylistSelection must be used inside <PlaylistSelectionProvider>');
    return value;
}

export function PlaylistSelectionProvider({ children }: { children: ReactNode }) {
    const { data: playlists } = usePlaylists();
    const player = usePlayer();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    // Opens on the playing playlist, once both are known; the choice then stays.
    if (selectedId === null && playlists?.length && !player.isPending)
        setSelectedId(player.data?.track?.playlistId ?? playlists[0].id);
    const selected =
        selectedId === null ? undefined : (playlists?.find(playlist => playlist.id === selectedId) ?? playlists?.[0]);

    const value: PlaylistSelectionContextValue = {
        playlists,
        selected,
        select: setSelectedId,
    };

    return <PlaylistSelectionContext value={value}>{children}</PlaylistSelectionContext>;
}

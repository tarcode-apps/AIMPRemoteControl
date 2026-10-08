'use client';

import { usePlayer } from '@/app/_api/player';
import { usePlaylists } from '@/app/_api/playlists';
import type { Playlist } from '@/app/_api/types';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { useNavigation } from './Navigation';

// A track another screen asks the playlist to put its cursor on.
export type TrackFocus = {
    playlistId: string;
    index: number;
};

export type PlaylistSelectionContextValue = {
    playlists: Playlist[] | undefined;
    selected: Playlist | undefined;
    select(id: string): void;
    // Pending until the playlist's page has shown the track.
    focus: TrackFocus | null;
    // Puts the cursor on the track for when the playlist screen is shown next.
    goToTrack(focus: TrackFocus): void;
    // The same, and shows the playlist screen.
    showTrack(focus: TrackFocus): void;
    clearFocus(): void;
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
    const [focus, setFocus] = useState<TrackFocus | null>(null);
    const { openScreen } = useNavigation();

    const goToTrack = (track: TrackFocus) => {
        setSelectedId(track.playlistId);
        setFocus({ playlistId: track.playlistId, index: track.index });
    };
    const value: PlaylistSelectionContextValue = {
        playlists,
        selected,
        select: setSelectedId,
        focus,
        goToTrack,
        showTrack: track => {
            goToTrack(track);
            openScreen('/');
        },
        clearFocus: () => setFocus(null),
    };

    return <PlaylistSelectionContext value={value}>{children}</PlaylistSelectionContext>;
}

'use client';

import type { ItemsSelection, ItemsSummary } from '@/app/_api/types';
import { useListMode, type ListModeValue } from '@/app/_components/lists';
import { useOnChange } from '@/app/_hooks/useOnChange';
import { usePlaylistSelection } from '@/app/_state/PlaylistSelection';
import { createContext, useContext, type ReactNode } from 'react';
import { usePlaylistView } from './usePlaylistLayout';

export type PlaylistModeContextValue = ListModeValue & {
    // Of what the list shows: the playlist, or its matches in a search.
    totals: ItemsSummary | undefined;
    // The selection as the requests about items take it; nothing while nothing is
    // selected or the list is not known yet.
    itemsSelection: ItemsSelection | undefined;
};

const PlaylistModeContext = createContext<PlaylistModeContextValue | null>(null);

export function usePlaylistMode(): PlaylistModeContextValue {
    const value = useContext(PlaylistModeContext);
    if (!value) throw new Error('usePlaylistMode must be used inside <PlaylistModeProvider>');
    return value;
}

export function PlaylistModeProvider({ children }: { children: ReactNode }) {
    const { selected: playlist } = usePlaylistSelection();
    const list = useListMode(playlist?.id);
    // The selection names items by position, which a change of the playlist moves.
    useOnChange(playlist?.revision, list.clearSelection);
    const { groups, totals } = usePlaylistView(playlist, list.text);

    const ranges = playlist && totals ? list.selectedRanges(totals.count, groups) : undefined;
    const itemsSelection =
        playlist && ranges
            ? {
                  search: list.text || undefined,
                  playlists: [{ playlistId: playlist.id, revision: playlist.revision, ranges }],
              }
            : undefined;

    return <PlaylistModeContext value={{ ...list, totals, itemsSelection }}>{children}</PlaylistModeContext>;
}

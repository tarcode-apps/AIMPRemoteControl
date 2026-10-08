'use client';

import { playlistKeys } from '@/app/_api/playlists';
import type { PlaylistGroups, PlaylistItem } from '@/app/_api/types';
import { useListMode, type ListModeValue } from '@/app/_components/lists';
import { usePlaylistSelection } from '@/app/_state/PlaylistSelection';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useState, type ReactNode } from 'react';

export type PlaylistModeContextValue = ListModeValue<PlaylistItem>;

const PlaylistModeContext = createContext<PlaylistModeContextValue | null>(null);

export function usePlaylistMode(): PlaylistModeContextValue {
    const value = useContext(PlaylistModeContext);
    if (!value) throw new Error('usePlaylistMode must be used inside <PlaylistModeProvider>');
    return value;
}

export function PlaylistModeProvider({ children }: { children: ReactNode }) {
    const client = useQueryClient();
    const { selected: playlist } = usePlaylistSelection();
    const list = useListMode<PlaylistItem>(playlist?.id);
    // The selection names items by index, which a change of the playlist renumbers.
    const [revision, setRevision] = useState(playlist?.revision);
    if (revision !== playlist?.revision) {
        setRevision(playlist?.revision);
        list.clearSelection();
    }

    // The groups the page lays out, for a selection that leaves some of them out.
    const itemSelection = () => {
        const groups =
            playlist && client.getQueryData<PlaylistGroups>(playlistKeys.groupsView(playlist.id, list.text))?.groups;
        return list.itemSelection(groups?.map(group => group.index));
    };

    return <PlaylistModeContext value={{ ...list, itemSelection }}>{children}</PlaylistModeContext>;
}

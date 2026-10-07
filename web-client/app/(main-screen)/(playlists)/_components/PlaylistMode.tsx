'use client';

import { playlistItemsQuery } from '@/app/_api/playlists';
import { useListMode, type ListModeValue } from '@/app/_components/lists';
import { usePlaylistSelection } from '@/app/_state/PlaylistSelection';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';

export type PlaylistModeContextValue = ListModeValue & {
    // For group headers, whose items may not be loaded.
    setRangeSelected(position: number, count: number, selected: boolean): Promise<void>;
};

const PlaylistModeContext = createContext<PlaylistModeContextValue | null>(null);

export function usePlaylistMode(): PlaylistModeContextValue {
    const value = useContext(PlaylistModeContext);
    if (!value) throw new Error('usePlaylistMode must be used inside <PlaylistModeProvider>');
    return value;
}

const maxRangeLimit = 500;

export function PlaylistModeProvider({ children }: { children: ReactNode }) {
    const client = useQueryClient();
    const { selected: playlist } = usePlaylistSelection();
    // Switching playlists leaves the mode.
    const list = useListMode(playlist?.id);

    const setRangeSelected = async (position: number, count: number, selected: boolean) => {
        if (list.mode === null || !playlist) return;
        const indexes: number[] = [];
        for (let offset = position; offset < position + count; offset += maxRangeLimit) {
            const page = await client.fetchQuery(
                playlistItemsQuery(playlist.id, {
                    offset,
                    limit: Math.min(maxRangeLimit, position + count - offset),
                    search: list.text,
                }),
            );
            for (const item of page.items) indexes.push(item.index);
        }
        list.setSelected(indexes, selected);
    };

    return <PlaylistModeContext value={{ ...list, setRangeSelected }}>{children}</PlaylistModeContext>;
}

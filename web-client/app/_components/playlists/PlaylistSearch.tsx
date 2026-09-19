'use client';

import { playlistItemsQuery } from '@/app/_api/playlists';
import { useDebouncedValue } from '@/app/_hooks/useDebouncedValue';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { media } from '@/app/_styles/media';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { usePlaylistSelection } from './PlaylistSelection';

// "Everything except these" or "only these", so that selecting all never needs the
// whole result list on the client.
export type Selection = {
    all: boolean;
    toggled: ReadonlySet<number>;
};

export type PlaylistSearchContextValue = {
    // null when no search field is open.
    query: string | null;
    setQuery(query: string | null): void;
    // Debounced and trimmed, for the requests.
    text: string;
    // Checkboxes and the selection toolbar are shown. On mobile opening the search
    // is enough, on docked layouts the field is always there and only text counts.
    active: boolean;
    selecting: boolean;
    setSelecting(selecting: boolean): void;
    selection: Selection;
    isSelected(index: number): boolean;
    setSelected(indexes: Iterable<number>, selected: boolean): void;
    toggleAll(): void;
    // For group headers, whose items may not be loaded.
    setRangeSelected(position: number, count: number, selected: boolean): Promise<void>;
};

const PlaylistSearchContext = createContext<PlaylistSearchContextValue | null>(null);

export function usePlaylistSearch(): PlaylistSearchContextValue {
    const value = useContext(PlaylistSearchContext);
    if (!value) throw new Error('usePlaylistSearch must be used inside <PlaylistSearchProvider>');
    return value;
}

const noSelection: Selection = { all: false, toggled: new Set() };
const maxRangeLimit = 500;

type SearchState = {
    playlistId: string;
    query: string | null;
    selecting: boolean;
    selection: Selection;
};

export function PlaylistSearchProvider({ children }: { children: ReactNode }) {
    const client = useQueryClient();
    const { selected: playlist } = usePlaylistSelection();
    const [state, setState] = useState<SearchState | null>(null);
    // Switching playlists ends the search.
    const current = state && playlist && state.playlistId === playlist.id ? state : null;
    const selection = current?.selection ?? noSelection;
    const docked = useMediaQuery(media.drawerDocked);
    const typed = current?.query?.trim() ?? '';
    const text = useDebouncedValue(typed, 300);

    const setQuery = (query: string | null) => {
        if (!playlist) setState(null);
        else if (query === null)
            setState(current => (current?.selecting ? { ...current, query: null, selection: noSelection } : null));
        else
            setState(current => ({
                playlistId: playlist.id,
                query,
                selecting: current?.selecting ?? false,
                selection: current && current.query?.trim() === query.trim() ? current.selection : noSelection,
            }));
    };

    const setSelecting = (selecting: boolean) => {
        if (!playlist || !selecting) setState(null);
        else
            setState(current => ({
                playlistId: playlist.id,
                query: current?.query ?? null,
                selecting: true,
                selection: noSelection,
            }));
    };

    const setSelected = (indexes: Iterable<number>, selected: boolean) =>
        setState(current => {
            if (!current) return current;
            const { all, toggled: previous } = current.selection;
            const toggled = new Set(previous);
            for (const index of indexes) {
                if (selected === all) toggled.delete(index);
                else toggled.add(index);
            }
            return { ...current, selection: { all, toggled } };
        });

    const toggleAll = () =>
        setState(current => {
            if (!current) return current;
            const { all, toggled } = current.selection;
            return { ...current, selection: { all: !all || toggled.size > 0, toggled: new Set() } };
        });

    const setRangeSelected = async (position: number, count: number, selected: boolean) => {
        if (!current || !playlist) return;
        const indexes: number[] = [];
        for (let offset = position; offset < position + count; offset += maxRangeLimit) {
            const page = await client.fetchQuery(
                playlistItemsQuery(playlist.id, {
                    offset,
                    limit: Math.min(maxRangeLimit, position + count - offset),
                    search: typed,
                }),
            );
            for (const item of page.items) indexes.push(item.index);
        }
        setSelected(indexes, selected);
    };

    const value: PlaylistSearchContextValue = {
        query: current?.query ?? null,
        setQuery,
        text,
        active: current !== null && (current.selecting || !docked || typed !== ''),
        selecting: current?.selecting ?? false,
        setSelecting,
        selection,
        isSelected: index => selection.all !== selection.toggled.has(index),
        setSelected,
        toggleAll,
        setRangeSelected,
    };

    return <PlaylistSearchContext value={value}>{children}</PlaylistSearchContext>;
}

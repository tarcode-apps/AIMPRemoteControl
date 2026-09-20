'use client';

import { playlistItemsQuery } from '@/app/_api/playlists';
import { useDebouncedValue } from '@/app/_hooks/useDebouncedValue';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { usePlaylistSelection } from './PlaylistSelection';

export type PlaylistMode = 'search' | 'select' | 'sort';

// "Everything except these" or "only these", so that selecting all never needs the
// whole result list on the client.
export type Selection = {
    all: boolean;
    toggled: ReadonlySet<number>;
};

export type PlaylistModeContextValue = {
    // The modes exclude each other: entering one leaves the other.
    mode: PlaylistMode | null;
    setMode(mode: 'select' | 'sort' | null): void;
    // The search field's text, null when the field is closed. Text enters the search.
    query: string | null;
    setQuery(query: string | null): void;
    // Debounced and trimmed, for the requests.
    text: string;
    // Checkboxes and the selection toolbar are shown: in the search and the selection.
    selecting: boolean;
    selection: Selection;
    isSelected(index: number): boolean;
    setSelected(indexes: Iterable<number>, selected: boolean): void;
    toggleAll(): void;
    // For group headers, whose items may not be loaded.
    setRangeSelected(position: number, count: number, selected: boolean): Promise<void>;
};

const PlaylistModeContext = createContext<PlaylistModeContextValue | null>(null);

export function usePlaylistMode(): PlaylistModeContextValue {
    const value = useContext(PlaylistModeContext);
    if (!value) throw new Error('usePlaylistMode must be used inside <PlaylistModeProvider>');
    return value;
}

const noSelection: Selection = { all: false, toggled: new Set() };
const maxRangeLimit = 500;

type ModeState = {
    playlistId: string;
    mode: PlaylistMode;
    query: string | null;
    selection: Selection;
};

export function PlaylistModeProvider({ children }: { children: ReactNode }) {
    const client = useQueryClient();
    const { selected: playlist } = usePlaylistSelection();
    const [state, setState] = useState<ModeState | null>(null);
    // Switching playlists leaves the mode.
    const current = state && playlist && state.playlistId === playlist.id ? state : null;
    const selection = current?.selection ?? noSelection;
    const typed = current?.mode === 'search' ? (current.query?.trim() ?? '') : '';
    const text = useDebouncedValue(typed, 300);

    const setQuery = (query: string | null) => {
        if (!playlist || query === null) setState(current => (current?.mode === 'search' ? null : current));
        else
            setState(current => ({
                playlistId: playlist.id,
                mode: 'search',
                query,
                selection:
                    current?.mode === 'search' && current.query?.trim() === query.trim()
                        ? current.selection
                        : noSelection,
            }));
    };

    const setMode = (mode: 'select' | 'sort' | null) => {
        if (!playlist || mode === null) setState(null);
        else setState({ playlistId: playlist.id, mode, query: null, selection: noSelection });
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

    const value: PlaylistModeContextValue = {
        mode: current?.mode ?? null,
        setMode,
        query: current?.mode === 'search' ? current.query : null,
        setQuery,
        text,
        selecting: current !== null && current.mode !== 'sort',
        selection,
        isSelected: index => selection.all !== selection.toggled.has(index),
        setSelected,
        toggleAll,
        setRangeSelected,
    };

    return <PlaylistModeContext value={value}>{children}</PlaylistModeContext>;
}

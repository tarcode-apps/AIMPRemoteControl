'use client';

import { usePlaylists } from '@/app/_api/playlists';
import { normalizeFields, useSearchPages, type SearchParams } from '@/app/_api/search';
import {
    searchFields,
    type ItemsSelection,
    type PlaylistGroup,
    type PlaylistSelection,
    type SearchField,
    type SearchPage,
} from '@/app/_api/types';
import {
    groupRange,
    pageRange,
    PlaylistRows,
    useCollapsedGroups,
    useListMode,
    type ListModeValue,
    type PositionRange,
} from '@/app/_components/lists';
import { useDebouncedValue } from '@/app/_hooks/useDebouncedValue';
import { useOnChange } from '@/app/_hooks/useOnChange';
import { usePersistedState } from '@/app/_hooks/usePersistedState';
import { useSearchParams } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type SearchOptions = {
    fields: SearchField[];
    // The playlists left out of the search; the rest, new ones included, are in.
    excluded: string[];
};

export type SearchModeContextValue = ListModeValue & {
    // The field's text; the results are for its debounced, trimmed form.
    typed: string;
    setTyped(typed: string): void;
    options: SearchOptions;
    setOptions(options: SearchOptions): void;
    // The search as the requests name it; null while there is nothing to look for.
    params: SearchParams | null;
    // The first page, which carries the totals and the playlists of the whole result.
    result: SearchPage | undefined;
    pending: boolean;
    error: Error | null;
    refetch(): void;
    // The results in groups by playlist, folded on the client.
    rows: PlaylistRows;
    toggleGroup(group: PlaylistGroup): void;
    setAllExpanded(expanded: boolean): void;
    // The selection as the requests about items take it, split by playlist in the
    // order of the results; nothing while nothing is selected or the result is
    // still the previous one.
    itemsSelection: ItemsSelection | undefined;
    // A group's hits as a selection; nothing while the result is still the
    // previous one.
    groupSelection(group: PlaylistGroup): ItemsSelection | undefined;
};

const SearchModeContext = createContext<SearchModeContextValue | null>(null);

export function useSearchMode(): SearchModeContextValue {
    const value = useContext(SearchModeContext);
    if (!value) throw new Error('useSearchMode must be used inside <SearchModeProvider>');
    return value;
}

const defaultOptions: SearchOptions = { fields: [...searchFields], excluded: [] };

function parseOptions(stored: unknown): SearchOptions | undefined {
    if (typeof stored !== 'object' || stored === null) return undefined;
    const { fields, excluded } = stored as Partial<SearchOptions>;
    if (!Array.isArray(fields) || !Array.isArray(excluded)) return undefined;
    const known = normalizeFields(fields.filter(field => searchFields.includes(field)));
    if (!known.length) return undefined;
    return { fields: known, excluded: excluded.filter(id => typeof id === 'string') };
}

export function SearchModeProvider({ children }: { children: ReactNode }) {
    const list = useListMode('search');
    const searchParams = useSearchParams();
    const [typed, setTyped] = useState(() => searchParams.get('q') ?? '');
    const text = useDebouncedValue(typed.trim(), 300);
    const [options, setOptions] = usePersistedState('search.options', defaultOptions, parseOptions);
    const { data: playlists } = usePlaylists();

    // The address keeps the text, for a reload and for coming back.
    useEffect(() => {
        const url = new URL(location.href);
        if (text) url.searchParams.set('q', text);
        else url.searchParams.delete('q');
        history.replaceState(history.state, '', url);
    }, [text]);

    // Only the loaded playlists are named, and only when some are left out; an
    // exclusion that empties the scope is ignored.
    const scope = useMemo(() => {
        if (!playlists || !options.excluded.length) return null;
        const excluded = new Set(options.excluded);
        const included = playlists.filter(playlist => !excluded.has(playlist.id)).map(playlist => playlist.id);
        return included.length && included.length < playlists.length ? included : null;
    }, [playlists, options.excluded]);
    const params = useMemo<SearchParams | null>(
        () => (text ? { search: text, fields: options.fields, playlists: scope } : null),
        [text, options.fields, scope],
    );
    const [firstPageQuery] = useSearchPages(params, [pageRange(0)]);
    const result = firstPageQuery?.data;
    // The previous result stands in while the next loads; a selection names hits of
    // the result it was made in, so none is sent meanwhile.
    const settled = firstPageQuery !== undefined && !firstPageQuery.isPlaceholderData;

    const { collapsed, toggle, setAll } = useCollapsedGroups();
    const groups = useMemo(() => {
        if (!result) return undefined;
        const names = new Map(playlists?.map(playlist => [playlist.id, playlist.name]));
        let position = 0;
        return result.playlists.map((playlist, index): PlaylistGroup => {
            const group = {
                index,
                name: names.get(playlist.id) ?? '',
                count: playlist.count,
                enabledCount: playlist.count,
                duration: playlist.duration,
                size: playlist.size,
                expanded: !collapsed.has(playlist.id),
                firstPosition: position,
            };
            position += playlist.count;
            return group;
        });
    }, [result, playlists, collapsed]);
    const rows = useMemo(() => new PlaylistRows(result?.total ?? 0, groups), [result?.total, groups]);

    // Positions name other hits once the result changes under the selection.
    const signature = result ? `${result.total}:${result.playlists.map(p => `${p.id}@${p.revision}`).join()}` : '';
    useOnChange(signature, () => {
        if (list.mode !== null) list.setMode(null);
    });

    // What a selection names in one playlist: the ranges of the result's positions
    // that fall in its group, counted from the group's first.
    const inPlaylist = (group: PlaylistGroup, ranges: PositionRange[]): PlaylistSelection | undefined => {
        const playlist = result?.playlists[group.index];
        if (!playlist) return undefined;
        const [first, last] = groupRange(group);
        const own = ranges.flatMap(([from, to]): PositionRange[] =>
            to < first || from > last ? [] : [[Math.max(from, first) - first, Math.min(to, last) - first]],
        );
        return own.length ? { playlistId: playlist.id, revision: playlist.revision, ranges: own } : undefined;
    };
    // The selected positions as the search's selection, split by playlist.
    const selectionOf = (ranges: PositionRange[], inGroups: readonly PlaylistGroup[]): ItemsSelection | undefined => {
        if (!params || !settled) return undefined;
        const playlists = inGroups.flatMap(group => {
            const named = inPlaylist(group, ranges);
            return named ? [named] : [];
        });
        return playlists.length ? { search: params.search, fields: params.fields, playlists } : undefined;
    };
    const ranges = result && groups ? list.selectedRanges(result.total, groups) : undefined;
    const itemsSelection = ranges && groups ? selectionOf(ranges, groups) : undefined;
    const groupSelection = (group: PlaylistGroup) => selectionOf([groupRange(group)], [group]);

    const value: SearchModeContextValue = {
        ...list,
        typed,
        setTyped,
        options,
        setOptions,
        params,
        result,
        pending: firstPageQuery?.isPending ?? false,
        error: firstPageQuery?.isError ? firstPageQuery.error : null,
        refetch: () => void firstPageQuery?.refetch(),
        rows,
        toggleGroup: group => {
            const id = result?.playlists[group.index]?.id;
            if (id !== undefined) toggle(id);
        },
        setAllExpanded: expanded => setAll(expanded, result?.playlists.map(playlist => playlist.id) ?? []),
        itemsSelection,
        groupSelection,
    };
    return <SearchModeContext value={value}>{children}</SearchModeContext>;
}

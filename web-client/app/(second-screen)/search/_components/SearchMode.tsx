'use client';

import { usePlaylists } from '@/app/_api/playlists';
import { normalizeFields, searchKeys, useSearchPages, type SearchParams } from '@/app/_api/search';
import {
    searchFields,
    type ItemsSummary,
    type PlaylistGroup,
    type SearchField,
    type SearchHit,
    type SearchPage,
    type SelectionInPlaylist,
} from '@/app/_api/types';
import {
    pageRange,
    pageSize,
    PlaylistRows,
    useCollapsedGroups,
    useListMode,
    type ListModeValue,
} from '@/app/_components/lists';
import { useDebouncedValue } from '@/app/_hooks/useDebouncedValue';
import { usePersistedState } from '@/app/_hooks/usePersistedState';
import { summaryOf } from '@/app/_utils/summary';
import { useQueryClient } from '@tanstack/react-query';
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
    // The selection split by playlist, in the order of the results; nothing while
    // nothing is selected.
    selectionByPlaylist(): SelectionInPlaylist[] | undefined;
    selectionTotals: ItemsSummary | undefined;
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
    const client = useQueryClient();
    const list = useListMode<SearchHit>('search');
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
    // the result it was made in, so none is made or sent meanwhile.
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
    const [seenSignature, setSeenSignature] = useState(signature);
    if (seenSignature !== signature) {
        setSeenSignature(signature);
        if (list.mode !== null) list.setMode(null);
    }

    const hitAt = (position: number) => {
        if (!params) return undefined;
        const page = Math.floor(position / pageSize);
        return client.getQueryData<SearchPage>(searchKeys.page(params, pageRange(page)))?.items[
            position - page * pageSize
        ];
    };

    // A row can only be toggled on screen, where its hit is loaded; the mode keeps
    // the hit in case its page drops out of the cache. Groups go as a whole.
    const setSelected: SearchModeContextValue['setSelected'] = (positions, selected, rows, group) => {
        if (settled) list.setSelected(positions, selected, rows, group, hitAt);
    };
    const setGroupSelected: SearchModeContextValue['setGroupSelected'] = (group, selected, rows) => {
        if (settled) list.setGroupSelected(group, selected, rows);
    };

    // Each group's toggled hits: left out of a group that is in, picked from one
    // that is out.
    const toggledByGroup = () => {
        const byGroup = new Map<number, SearchHit[]>();
        for (const { group, data: hit } of list.selection.toggled.values()) {
            if (group === undefined || !hit) continue;
            const hits = byGroup.get(group);
            if (hits) hits.push(hit);
            else byGroup.set(group, [hit]);
        }
        return byGroup;
    };

    const selectionByPlaylist = () => {
        if (list.nothingSelected || !params || !result || !settled) return undefined;
        const toggled = toggledByGroup();
        return result.playlists.flatMap((playlist, group): SelectionInPlaylist[] => {
            const indexes = toggled.get(group)?.map(hit => hit.index) ?? [];
            if (list.groupSelected(group))
                return [
                    {
                        playlistId: playlist.id,
                        revision: playlist.revision,
                        selection: { search: params.search, fields: params.fields, except: indexes },
                    },
                ];
            return indexes.length
                ? [{ playlistId: playlist.id, revision: playlist.revision, selection: { indexes } }]
                : [];
        });
    };

    const selectionTotals = settled
        ? list.selectedTotals({
              all: result && { count: result.total, duration: result.duration, size: result.size },
              group: group => result?.playlists[group],
              row: summaryOf,
          })
        : undefined;

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
        setSelected,
        setGroupSelected,
        selectionByPlaylist,
        selectionTotals,
    };
    return <SearchModeContext value={value}>{children}</SearchModeContext>;
}

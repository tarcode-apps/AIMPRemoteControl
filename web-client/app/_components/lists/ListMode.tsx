'use client';

import type { ItemSelection } from '@/app/_api/types';
import { useBackGesture } from '@/app/_hooks/useBackGesture';
import { useDebouncedValue } from '@/app/_hooks/useDebouncedValue';
import { useState } from 'react';

type ListMode = 'search' | 'select' | 'sort';

// "Everything except these" or "only these", so that selecting all never needs the
// whole list on the client.
type Selection = {
    all: boolean;
    toggled: ReadonlySet<number>;
};

export type ListModeValue = {
    // The modes exclude each other: entering one leaves the other.
    mode: ListMode | null;
    setMode(mode: 'select' | 'sort' | null): void;
    // The search field's text, null when the field is closed. Text enters the search.
    query: string | null;
    setQuery(query: string | null): void;
    // Debounced and trimmed, for the requests.
    text: string;
    // Checkboxes and the selection toolbar are shown: in the search and the selection.
    selecting: boolean;
    allSelected: boolean;
    nothingSelected: boolean;
    isSelected(id: number): boolean;
    setSelected(ids: Iterable<number>, selected: boolean): void;
    toggleAll(): void;
    clearSelection(): void;
    // The selection as a request names it; nothing while nothing is selected.
    itemSelection(): ItemSelection | undefined;
};

const noSelection: Selection = { all: false, toggled: new Set() };

type ModeState = {
    scope: string;
    mode: ListMode;
    query: string | null;
    selection: Selection;
};

// The search, selection and sort modes of one list. `scope` names the list the
// state belongs to: a change of scope leaves the mode, and without a scope the
// setters do nothing.
export function useListMode(scope: string | undefined): ListModeValue {
    const [state, setState] = useState<ModeState | null>(null);
    const current = state && scope !== undefined && state.scope === scope ? state : null;
    const { all, toggled } = current?.selection ?? noSelection;
    const typed = current?.mode === 'search' ? (current.query?.trim() ?? '') : '';
    const text = useDebouncedValue(typed, 300);
    useBackGesture(current !== null, () => setState(null));

    const setQuery = (query: string | null) => {
        if (scope === undefined || query === null) setState(current => (current?.mode === 'search' ? null : current));
        else
            setState(current => ({
                scope,
                mode: 'search',
                query,
                selection:
                    current?.mode === 'search' && current.query?.trim() === query.trim()
                        ? current.selection
                        : noSelection,
            }));
    };

    const setMode = (mode: 'select' | 'sort' | null) => {
        if (scope === undefined || mode === null) setState(null);
        else setState({ scope, mode, query: null, selection: noSelection });
    };

    const setSelected = (ids: Iterable<number>, selected: boolean) =>
        setState(current => {
            if (!current) return current;
            const { all, toggled: previous } = current.selection;
            const toggled = new Set(previous);
            for (const id of ids) {
                if (selected === all) toggled.delete(id);
                else toggled.add(id);
            }
            return { ...current, selection: { all, toggled } };
        });

    const toggleAll = () =>
        setState(current => {
            if (!current) return current;
            const { all, toggled } = current.selection;
            return { ...current, selection: { all: !all || toggled.size > 0, toggled: new Set() } };
        });

    return {
        mode: current?.mode ?? null,
        setMode,
        query: current?.mode === 'search' ? current.query : null,
        setQuery,
        text,
        selecting: current !== null && current.mode !== 'sort',
        allSelected: all && toggled.size === 0,
        nothingSelected: !all && toggled.size === 0,
        isSelected: id => all !== toggled.has(id),
        setSelected,
        toggleAll,
        clearSelection: () => setState(current => current && { ...current, selection: noSelection }),
        itemSelection: () => {
            if (!all && toggled.size === 0) return undefined;
            return all ? { search: text, except: [...toggled] } : { indexes: [...toggled] };
        },
    };
}

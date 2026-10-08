'use client';

import type { ItemSelection, ItemsSummary, PlaylistGroup } from '@/app/_api/types';
import { useBackGesture } from '@/app/_hooks/useBackGesture';
import { useDebouncedValue } from '@/app/_hooks/useDebouncedValue';
import { addSummary, noItems } from '@/app/_utils/summary';
import { useMemo, useState } from 'react';
import type { PlaylistRows } from './playlistRows';

type ListMode = 'search' | 'select' | 'sort';

// A row that differs from its group: the group it is in, and what the list keeps of
// it while it is on screen, `T`, so that the row can be acted on and counted later.
export type ToggledRow<T> = {
    group: number | undefined;
    data: T | undefined;
};

// What is selected without the client holding the rows: each group is in or out
// as a whole, every group being in when `all` is set and the groups in `flipped`
// the other way round; `toggled` holds the rows that differ from their group.
// Rows of no group are those of a flat list and go with `all`.
export type Selection<T> = {
    all: boolean;
    flipped: ReadonlySet<number>;
    toggled: ReadonlyMap<number, ToggledRow<T>>;
};

export type GroupCheckState = {
    checked: boolean;
    indeterminate: boolean;
};

// The totals a selection is summed from.
export type SelectionTotals<T> = {
    // Of the whole list; needed once everything is selected.
    all: ItemsSummary | undefined;
    // Of a group; needed for the groups that are in or out as a whole.
    group(group: number): ItemsSummary | undefined;
    row(data: T): ItemsSummary;
};

export type ListModeValue<T = unknown> = {
    // The modes exclude each other: entering one leaves the other.
    mode: ListMode | null;
    setMode(mode: 'select' | 'sort' | null): void;
    // Leaves the mode and runs `after` once its history entry is gone, so that a
    // navigation away does not leave the entry behind.
    leaveThen(after: () => void): void;
    // The search field's text, null when the field is closed. Text enters the search.
    query: string | null;
    setQuery(query: string | null): void;
    // Debounced and trimmed, for the requests.
    text: string;
    // Checkboxes and the selection toolbar are shown: in the search and the selection.
    selecting: boolean;
    selection: Selection<T>;
    allSelected: boolean;
    nothingSelected: boolean;
    // Whether the group as a whole is in, which its rows follow unless toggled.
    groupSelected(group: number | undefined): boolean;
    isSelected(id: number, group?: number): boolean;
    // `rows` are the rows on screen, whose sizes the selection is settled by;
    // `dataOf` gives what to keep of the rows picked or left out.
    setSelected(
        ids: Iterable<number>,
        selected: boolean,
        rows: PlaylistRows,
        group?: PlaylistGroup,
        dataOf?: (id: number) => T | undefined,
    ): void;
    groupCheckState(group: number): GroupCheckState;
    setGroupSelected(group: number, selected: boolean, rows: PlaylistRows): void;
    toggleAll(): void;
    clearSelection(): void;
    // The selection as a playlist request names it; nothing while nothing is
    // selected. `groups` are the list's groups, needed once some are left out of
    // everything.
    itemSelection(groups?: readonly number[]): ItemSelection | undefined;
    // Summed without the rows: whole groups by their totals, toggled rows by what
    // was kept of them. Nothing while some total is not known yet.
    selectedTotals(totals: SelectionTotals<T>): ItemsSummary | undefined;
};

const noSelection: Selection<never> = { all: false, flipped: new Set(), toggled: new Map() };

// One form for each selection, so that the checkboxes, the toolbar and the request
// read the same however it was made: a group whose rows were all toggled one by one
// turns over as a whole, and so does the list once every group has.
function settled<T>(selection: Selection<T>, rows: PlaylistRows, group?: PlaylistGroup): Selection<T> {
    let { all, flipped, toggled } = selection;
    const key = group?.index;
    let count = 0;
    for (const row of toggled.values()) if (row.group === key) count++;
    if (count > 0 && count === (group ? group.count : rows.itemCount)) {
        toggled = new Map([...toggled].filter(([, row]) => row.group !== key));
        if (key === undefined) all = !all;
        else {
            const next = new Set(flipped);
            if (!next.delete(key)) next.add(key);
            flipped = next;
        }
    }
    if (flipped.size > 0 && flipped.size === rows.groupCount) {
        all = !all;
        flipped = noSelection.flipped;
    }
    return all || flipped.size || toggled.size ? { all, flipped, toggled } : noSelection;
}

type ModeState<T> = {
    scope: string;
    mode: ListMode;
    query: string | null;
    selection: Selection<T>;
    // The search text the selection was made in: the rows it names go with it.
    selectedIn: string;
};

// The search, selection and sort modes of one list. `scope` names the list the
// state belongs to: a change of scope leaves the mode, and without a scope the
// setters do nothing. The modes and the selection live no longer than the page.
export function useListMode<T = never>(scope: string | undefined): ListModeValue<T> {
    const [state, setState] = useState<ModeState<T> | null>(null);
    const current = state?.scope === scope ? state : null;
    const typed = current?.mode === 'search' ? (current.query?.trim() ?? '') : '';
    const debounced = useDebouncedValue(typed, 300);
    // Clearing the field is not waited for.
    const text = typed && debounced;
    if (state && !current) setState(null);
    else if (current && current.selectedIn !== text) setState({ ...current, selection: noSelection, selectedIn: text });
    const selection: Selection<T> = current?.selection ?? noSelection;
    const { all, flipped, toggled } = selection;
    const back = useBackGesture(current !== null, () => setState(null));

    const toggledByGroup = useMemo(() => {
        const counts = new Map<number | undefined, number>();
        for (const { group } of toggled.values()) counts.set(group, (counts.get(group) ?? 0) + 1);
        return counts;
    }, [toggled]);

    const groupSelected = (group: number | undefined) => all !== (group !== undefined && flipped.has(group));
    const allSelected = all && flipped.size === 0 && toggled.size === 0;
    const nothingSelected = selection === noSelection;

    const setQuery = (query: string | null) => {
        if (scope === undefined || query === null) setState(current => (current?.mode === 'search' ? null : current));
        else
            setState(current =>
                current?.scope === scope && current.mode === 'search'
                    ? { ...current, query }
                    : { scope, mode: 'search', query, selection: noSelection, selectedIn: '' },
            );
    };

    const setMode = (mode: 'select' | 'sort' | null) => {
        if (scope === undefined || mode === null) setState(null);
        else setState({ scope, mode, query: null, selection: noSelection, selectedIn: '' });
    };

    const updateSelection = (change: (selection: Selection<T>) => Selection<T>) =>
        setState(current => {
            if (!current) return current;
            const next = change(current.selection);
            return next === current.selection ? current : { ...current, selection: next };
        });

    return {
        mode: current?.mode ?? null,
        setMode,
        leaveThen: after => back.dismiss(after),
        query: current?.mode === 'search' ? current.query : null,
        setQuery,
        text,
        selecting: current !== null && current.mode !== 'sort',
        selection,
        allSelected,
        nothingSelected,
        groupSelected,
        isSelected: (id, group) => groupSelected(group) !== toggled.has(id),
        setSelected: (ids, selected, rows, group, dataOf) =>
            updateSelection(previous => {
                const key = group?.index;
                const inGroup = previous.all !== (key !== undefined && previous.flipped.has(key));
                const next = new Map(previous.toggled);
                for (const id of ids) {
                    if (selected === inGroup) next.delete(id);
                    else next.set(id, { group: key, data: dataOf?.(id) });
                }
                return settled({ ...previous, toggled: next }, rows, group);
            }),
        groupCheckState: group => {
            const inGroup = groupSelected(group);
            const toggledRows = toggledByGroup.get(group) ?? 0;
            const checked = inGroup && toggledRows === 0;
            return { checked, indeterminate: !checked && (inGroup || toggledRows > 0) };
        },
        setGroupSelected: (group, selected, rows) =>
            updateSelection(previous => {
                const flipped = new Set(previous.flipped);
                if (selected === previous.all) flipped.delete(group);
                else flipped.add(group);
                const toggled = new Map([...previous.toggled].filter(([, row]) => row.group !== group));
                return settled({ all: previous.all, flipped, toggled }, rows);
            }),
        toggleAll: () => updateSelection(() => (allSelected ? noSelection : { ...noSelection, all: true })),
        clearSelection: () => updateSelection(() => noSelection),
        itemSelection: groups => {
            if (nothingSelected) return undefined;
            if (!all && flipped.size === 0) return { indexes: [...toggled.keys()] };
            const except: number[] = [];
            const extra: number[] = [];
            for (const [id, { group }] of toggled) (groupSelected(group) ? except : extra).push(id);
            if (flipped.size === 0) return { search: text, except, indexes: extra };
            if (!all) return { search: text, groups: [...flipped], except, indexes: extra };
            if (!groups) throw new Error('The groups left out of the selection are named against all of them');
            return { search: text, groups: groups.filter(group => !flipped.has(group)), except, indexes: extra };
        },
        selectedTotals: totals => {
            let sum = noItems;
            if (all) {
                if (!totals.all) return undefined;
                sum = totals.all;
            }
            for (const group of flipped) {
                const groupTotals = totals.group(group);
                if (!groupTotals) return undefined;
                sum = addSummary(sum, groupTotals, all ? -1 : 1);
            }
            for (const { group, data } of toggled.values()) {
                if (data === undefined) return undefined;
                sum = addSummary(sum, totals.row(data), groupSelected(group) ? -1 : 1);
            }
            return sum;
        },
    };
}

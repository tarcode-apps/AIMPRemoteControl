'use client';

import type { PlaylistGroup } from '@/app/_api/types';
import { useBackGesture } from '@/app/_hooks/useBackGesture';
import { useDebouncedValue } from '@/app/_hooks/useDebouncedValue';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { groupRange, positions, type PositionRange } from './groups';
import type { PlaylistRows } from './playlistRows';

type ListMode = 'search' | 'select' | 'sort';

// What is selected without the client holding the rows: each group is in or out
// as a whole, every group being in when `all` is set and the groups in `flipped`
// the other way round; `toggled` holds the rows that differ from their group, by
// id, with the group they are in. Rows of no group are those of a flat list and
// go with `all`.
export type Selection = {
    all: boolean;
    flipped: ReadonlySet<number>;
    toggled: ReadonlyMap<number, number | undefined>;
};

export type GroupCheckState = {
    checked: boolean;
    indeterminate: boolean;
};

// A key pressed in the list's search field that the list may take: true when it did.
export type SearchKeyHandler = (event: KeyboardEvent<HTMLInputElement>) => boolean;

export type ListModeValue = {
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
    allSelected: boolean;
    nothingSelected: boolean;
    // Whether the group as a whole is in, which its rows follow unless toggled.
    groupSelected(group: number | undefined): boolean;
    isSelected(id: number, group?: number): boolean;
    // Rows picked by hand, which the anchor follows. `rows` are the rows on
    // screen, whose sizes the selection is settled by.
    setSelected(ids: Iterable<number>, selected: boolean, rows: PlaylistRows, group?: PlaylistGroup): void;
    groupCheckState(group: number): GroupCheckState;
    // A group picked by hand: the anchor goes to its first row.
    setGroupSelected(group: number, selected: boolean, rows: PlaylistRows): void;
    // The positions from `from` to `to`, either way round. With `byGroups` a group
    // wholly inside goes as a whole, as in the lists whose selection counts groups;
    // the rest goes row by row.
    selectRange(from: number, to: number, selected: boolean, rows: PlaylistRows, byGroups?: boolean): void;
    selectAll(): void;
    toggleAll(): void;
    clearSelection(): void;
    // The position a range is drawn from: the last row picked by hand, which the
    // keys may move. Null takes it away.
    anchor: number | null;
    setAnchor(position: number | null): void;
    // The selected positions as ranges, over the `groups` of the list, which holds
    // `itemCount` items; nothing while nothing is selected.
    selectedRanges(itemCount: number, groups: readonly PlaylistGroup[] | undefined): PositionRange[] | undefined;
    // The list's page lends the search field its keys: the arrows walk into the
    // list, Enter acts on the row under the cursor, else on the first. The field,
    // wherever the layout puts it, hands its keys to `searchKeyDown`, which
    // prevents the ones taken.
    setSearchKeys(handler: SearchKeyHandler | null): void;
    searchKeyDown(event: KeyboardEvent<HTMLInputElement>): void;
};

const noSelection: Selection = { all: false, flipped: new Set(), toggled: new Map() };

// One form for each selection, so that the checkboxes, the toolbar and the request
// read the same however it was made: a group whose rows were all toggled one by one
// turns over as a whole, and so does the list once every group has.
function settled(selection: Selection, rows: PlaylistRows, group?: PlaylistGroup): Selection {
    let { all, flipped, toggled } = selection;
    const key = group?.index;
    let count = 0;
    for (const rowGroup of toggled.values()) if (rowGroup === key) count++;
    if (count > 0 && count === (group ? group.count : rows.itemCount)) {
        toggled = new Map([...toggled].filter(([, rowGroup]) => rowGroup !== key));
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

function withRows(
    selection: Selection,
    ids: Iterable<number>,
    selected: boolean,
    rows: PlaylistRows,
    group: PlaylistGroup | undefined,
): Selection {
    const key = group?.index;
    const inGroup = selection.all !== (key !== undefined && selection.flipped.has(key));
    const toggled = new Map(selection.toggled);
    for (const id of ids) {
        if (selected === inGroup) toggled.delete(id);
        else toggled.set(id, key);
    }
    return settled({ ...selection, toggled }, rows, group);
}

function withGroup(selection: Selection, group: number, selected: boolean, rows: PlaylistRows): Selection {
    const flipped = new Set(selection.flipped);
    if (selected === selection.all) flipped.delete(group);
    else flipped.add(group);
    const toggled = new Map([...selection.toggled].filter(([, rowGroup]) => rowGroup !== group));
    return settled({ all: selection.all, flipped, toggled }, rows);
}

// The ranges merged, in order, with the excluded positions cut out.
function mergeRanges(included: PositionRange[], excluded: number[]): PositionRange[] | undefined {
    included.sort((a, b) => a[0] - b[0]);
    const merged: PositionRange[] = [];
    for (const [from, to] of included) {
        const last = merged.at(-1);
        if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
        else merged.push([from, to]);
    }
    excluded.sort((a, b) => a - b);
    const ranges: PositionRange[] = [];
    let cut = 0;
    for (const [from, to] of merged) {
        let start = from;
        while (cut < excluded.length && excluded[cut] <= to) {
            const position = excluded[cut++];
            if (position < start) continue;
            if (position > start) ranges.push([start, position - 1]);
            start = position + 1;
        }
        if (start <= to) ranges.push([start, to]);
    }
    return ranges.length ? ranges : undefined;
}

type ModeState = {
    scope: string;
    mode: ListMode;
    query: string | null;
    selection: Selection;
    anchor: number | null;
    // The search text the selection was made in: the rows it names go with it.
    selectedIn: string;
};

// The search, selection and sort modes of one list. `scope` names the list the
// state belongs to: a change of scope leaves the mode, and without a scope the
// setters do nothing. The modes and the selection live no longer than the page.
export function useListMode(scope: string | undefined): ListModeValue {
    const [state, setState] = useState<ModeState | null>(null);
    const current = state?.scope === scope ? state : null;
    const typed = current?.mode === 'search' ? (current.query?.trim() ?? '') : '';
    const debounced = useDebouncedValue(typed, 300);
    // Clearing the field is not waited for.
    const text = typed && debounced;
    if (state && !current) setState(null);
    else if (current && current.selectedIn !== text)
        setState({ ...current, selection: noSelection, anchor: null, selectedIn: text });
    const selection: Selection = current?.selection ?? noSelection;
    const { all, flipped, toggled } = selection;
    const back = useBackGesture(current !== null, () => setState(null));
    const searchKeys = useRef<SearchKeyHandler | null>(null);

    const toggledByGroup = useMemo(() => {
        const counts = new Map<number | undefined, number>();
        for (const group of toggled.values()) counts.set(group, (counts.get(group) ?? 0) + 1);
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
                    : { scope, mode: 'search', query, selection: noSelection, anchor: null, selectedIn: '' },
            );
    };

    const setMode = (mode: 'select' | 'sort' | null) => {
        if (scope === undefined || mode === null) setState(null);
        else setState({ scope, mode, query: null, selection: noSelection, anchor: null, selectedIn: '' });
    };

    // `anchor` moves the anchor; null takes it away.
    const updateSelection = (change: (selection: Selection) => Selection, anchor?: number | null) =>
        setState(current => {
            if (!current) return current;
            const next = change(current.selection);
            const moved = anchor !== undefined && anchor !== current.anchor;
            return next === current.selection && !moved
                ? current
                : { ...current, selection: next, anchor: moved ? anchor : current.anchor };
        });

    return {
        mode: current?.mode ?? null,
        setMode,
        leaveThen: after => back.dismiss(after),
        query: current?.mode === 'search' ? current.query : null,
        setQuery,
        text,
        selecting: current !== null && current.mode !== 'sort',
        allSelected,
        nothingSelected,
        groupSelected,
        isSelected: (id, group) => groupSelected(group) !== toggled.has(id),
        setSelected: (ids, selected, rows, group) => {
            const picked = [...ids];
            updateSelection(previous => withRows(previous, picked, selected, rows, group), picked[0]);
        },
        groupCheckState: group => {
            const inGroup = groupSelected(group);
            const toggledRows = toggledByGroup.get(group) ?? 0;
            const checked = inGroup && toggledRows === 0;
            return { checked, indeterminate: !checked && (inGroup || toggledRows > 0) };
        },
        setGroupSelected: (group, selected, rows) =>
            updateSelection(
                previous => withGroup(previous, group, selected, rows),
                rows.groups.find(({ index }) => index === group)?.firstPosition,
            ),
        selectRange: (from, to, selected, rows, byGroups = true) =>
            updateSelection(previous => {
                const [low, high] = from <= to ? [from, to] : [to, from];
                const groups = rows.groups;
                if (!byGroups || !groups.length)
                    return withRows(previous, positions([low, high]), selected, rows, undefined);
                let next = previous;
                for (const group of groups) {
                    const [first, last] = groupRange(group);
                    if (last < low || first > high) continue;
                    next =
                        first >= low && last <= high
                            ? withGroup(next, group.index, selected, rows)
                            : withRows(
                                  next,
                                  positions([Math.max(low, first), Math.min(high, last)]),
                                  selected,
                                  rows,
                                  group,
                              );
                }
                return next;
            }),
        selectAll: () => updateSelection(() => ({ ...noSelection, all: true })),
        toggleAll: () => updateSelection(() => (allSelected ? noSelection : { ...noSelection, all: true })),
        clearSelection: () => updateSelection(() => noSelection, null),
        anchor: current?.anchor ?? null,
        setAnchor: position => updateSelection(selection => selection, position),
        selectedRanges: (itemCount, groups) => {
            if (nothingSelected || itemCount === 0) return undefined;
            const included: PositionRange[] = [];
            const excluded: number[] = [];
            if (groups?.length) {
                for (const group of groups)
                    if (group.count > 0 && groupSelected(group.index)) included.push(groupRange(group));
            } else if (all) included.push([0, itemCount - 1]);
            for (const [id, group] of toggled) {
                if (groupSelected(group)) excluded.push(id);
                else included.push([id, id]);
            }
            return mergeRanges(included, excluded);
        },
        setSearchKeys: handler => {
            searchKeys.current = handler;
        },
        searchKeyDown: event => {
            if (searchKeys.current?.(event)) event.preventDefault();
        },
    };
}

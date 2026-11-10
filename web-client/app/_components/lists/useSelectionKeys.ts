'use client';

import { isSelectAllKey, useGlobalKey } from '@/app/_hooks/useGlobalKey';
import { useRef, type KeyboardEvent, type MouseEvent, type RefObject } from 'react';
import { groupPositions, groupRange, positionsCheckState, type PositionRange } from './groups';
import type { ListModeValue } from './ListMode';
import type { PlaylistRow, PlaylistRows } from './playlistRows';
import type { useActiveRow } from './useActiveRow';

export type SelectionKeysOptions = {
    mode: ListModeValue;
    rows: PlaylistRows;
    active: ReturnType<typeof useActiveRow>;
    // The listbox element, which Ctrl+A pressed anywhere on the page goes to.
    list: RefObject<HTMLElement | null>;
    // Whether the selection counts whole groups, as the lists the server pages do.
    byGroups?: boolean;
    // While the list sorts or picks a track, the selection's keys do not apply;
    // Escape still leaves the sort.
    disabled?: boolean;
    // A row is being dragged: Escape cancels that instead.
    dragging?: boolean;
};

export type SelectionKeys = {
    // A click on a row, ahead of the row's own handlers: true when the modifiers
    // made it the selection's, and the row then hears nothing of it.
    onRowClick(event: MouseEvent, row: number): boolean;
    // A key in the list, ahead of its own handling: true when it was the selection's.
    onKeyDown(event: KeyboardEvent, count: number, pageRows: number): boolean;
    isSelected(row: PlaylistRow): boolean;
    // A header stands for its group.
    setSelected(row: PlaylistRow, selected: boolean): void;
    toggle(row: PlaylistRow): void;
    // A row picked by hand, with its checkbox or a plain click: `change` takes it,
    // and the cursor goes to the row, for the keys to go on from there.
    pick(row: number, change: () => void): void;
};

const moveKeys = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End']);

// The parts of `span` that `next` does not cover.
function outside([low, high]: PositionRange, [from, to]: PositionRange): PositionRange[] {
    const parts: PositionRange[] = [];
    if (low < from) parts.push([low, Math.min(high, from - 1)]);
    if (high > to) parts.push([Math.max(low, to + 1), high]);
    return parts;
}

// The ways into the selection that desktop lists have: Ctrl+A takes everything,
// Ctrl+click a row, Shift+click and Shift with the moving keys a range from the
// anchor, the row last picked. Each enters the selection when the list is not in
// it. Cmd stands for Ctrl on a Mac.
export function useSelectionKeys({
    mode,
    rows,
    active,
    list,
    byGroups = true,
    disabled = false,
    dragging = false,
}: SelectionKeysOptions): SelectionKeys {
    // The range Shift last drew with the keys: the next one takes its place, so
    // that stepping back shrinks it. Read by the handlers alone, so no state: a
    // plain click must change nothing before it reaches its row, or React
    // restores a checkbox it re-renders in the capture phase, and the click is lost.
    const drawn = useRef<PositionRange | null>(null);

    const enter = () => {
        if (mode.mode === null) mode.setMode('select');
    };
    // The positions a row stands for: a header, its whole group.
    const span = (row: PlaylistRow): PositionRange =>
        row.kind === 'item' ? [row.position, row.position] : groupRange(row.group);
    // The group a row is told by: none in a list whose groups the selection does
    // not count, or the row would turn its group over once it is the last toggled.
    const groupOf = (row: PlaylistRow) => (byGroups ? row.group : undefined);
    const isSelected = (row: PlaylistRow) =>
        row.kind === 'item'
            ? mode.isSelected(row.position, groupOf(row)?.index)
            : positionsCheckState(row.group, position => mode.isSelected(position, groupOf(row)?.index)).checked;
    const setSelected = (row: PlaylistRow, selected: boolean) => {
        if (row.kind === 'item') mode.setSelected([row.position], selected, rows, groupOf(row));
        else if (byGroups) mode.setGroupSelected(row.group.index, selected, rows);
        else mode.setSelected(groupPositions(row.group), selected, rows);
    };
    // From the anchor over the row, the row's group whole.
    const rangeTo = (anchor: number, row: PlaylistRow): PositionRange => {
        const [first, last] = span(row);
        return anchor <= first ? [anchor, last] : [first, anchor];
    };
    const cursorPosition = (): number | null => {
        const row = active.row === null ? null : rows.at(active.row);
        return row ? span(row)[0] : null;
    };
    const selectAll = () => {
        enter();
        mode.selectAll();
        drawn.current = null;
    };
    // Escape undoes the last thing: the selection, then whichever mode the list is
    // in, the sort included. A drag in progress takes the key itself.
    const escape = (): boolean => {
        if (mode.mode === null || dragging || (disabled && mode.mode !== 'sort')) return false;
        if (!disabled && !mode.nothingSelected) mode.clearSelection();
        else mode.setMode(null);
        drawn.current = null;
        return true;
    };

    // Pressed outside the list, as on the toolbar; the list hears the keys itself
    // while it has the focus.
    useGlobalKey(
        event => event.key === 'Escape' || isSelectAllKey(event),
        event => {
            const element = list.current;
            if (!element || element.contains(event.target as Node) || !element.checkVisibility()) return;
            if (event.key === 'Escape') escape();
            else if (!disabled) {
                element.focus();
                selectAll();
            }
        },
    );

    return {
        onRowClick(event, index) {
            if (disabled) return false;
            const row = rows.at(index);
            const modified = event.ctrlKey || event.metaKey;
            // The row picked moves the anchor itself.
            drawn.current = null;
            if (!modified && !event.shiftKey) return false;
            enter();
            // The row hears nothing of the click, so the cursor is put on it here.
            active.select(rows.keyAt(index));
            // The range takes the state the row would: so it is added or taken away.
            const selected = !isSelected(row);
            if (event.shiftKey) {
                const [from, to] = rangeTo(mode.anchor ?? cursorPosition() ?? span(row)[0], row);
                mode.selectRange(from, to, selected, rows, byGroups);
            } else setSelected(row, selected);
            // A checkbox toggles itself to the very state the row gets; cancelling the
            // click would undo that after React has drawn it, leaving the box blank.
            if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
            event.stopPropagation();
            return true;
        },
        onKeyDown(event, count, pageRows) {
            if (event.key === 'Escape' && escape()) {
                event.preventDefault();
                return true;
            }
            if (disabled) return false;
            if (isSelectAllKey(event.nativeEvent)) {
                selectAll();
                event.preventDefault();
                return true;
            }
            if (!moveKeys.has(event.key)) {
                // Space picks the row, which the list handles.
                if (event.key === ' ') drawn.current = null;
                return false;
            }
            if (!event.shiftKey) {
                drawn.current = null;
                return false;
            }
            const anchor = mode.anchor ?? cursorPosition();
            const target = active.move(event.key, count, pageRows);
            if (target === null) return false;
            const row = rows.at(target);
            const from = anchor ?? span(row)[0];
            enter();
            if (mode.anchor === null) mode.setAnchor(from);
            const next = rangeTo(from, row);
            if (drawn.current)
                for (const [low, high] of outside(drawn.current, next))
                    mode.selectRange(low, high, false, rows, byGroups);
            mode.selectRange(next[0], next[1], true, rows, byGroups);
            drawn.current = next;
            event.preventDefault();
            return true;
        },
        isSelected,
        setSelected,
        toggle: row => setSelected(row, !isSelected(row)),
        pick(row, change) {
            change();
            active.select(rows.keyAt(row));
        },
    };
}

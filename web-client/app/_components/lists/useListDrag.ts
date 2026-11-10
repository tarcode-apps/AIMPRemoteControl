import { usePointerDrag } from '@/app/_hooks/usePointerDrag';
import type { Virtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { PlaylistRows } from './playlistRows';

export type DragSource = {
    // One item row, or a group header with its items. The list lays the block out at
    // zero height (`hidden`), so the rows close up behind it.
    row: number;
    rowCount: number;
    // Of the ghost: a group is represented by its header.
    ghostHeight: number;
};

export type DragState = {
    source: DragSource;
    // The block lands before this row; the rows from it on make room.
    boundary: number;
    // Of the ghost, in list coordinates.
    top: number;
    // Set on release: the ghost stays in its slot until the data behind the boundary
    // row is reloaded, that is until its revision differs from this one.
    settledAt?: number;
};

export type PlaylistDragOptions = {
    enabled: boolean;
    scrollRef: RefObject<HTMLElement | null>;
    rows: PlaylistRows;
    virtualizer: Virtualizer<HTMLDivElement, Element>;
    revisionOf(row: number): number | undefined;
    onDrop(row: number, boundary: number): void;
};

type Gesture = {
    source: DragSource;
    // Distance from the pointer to the top of the ghost.
    grab: number;
    startClientY: number;
    clientY: number;
    boundary: number;
    top: number;
    started: boolean;
    aborted: boolean;
    frame: number;
};

const edgeSize = 48;
const maxScrollStep = 16;

export function usePlaylistDrag({ enabled, scrollRef, rows, virtualizer, revisionOf, onDrop }: PlaylistDragOptions) {
    const [lastState, setState] = useState<DragState | null>(null);
    const gesture = useRef<Gesture | null>(null);
    const pendingRow = useRef<number | null>(null);

    const rowStart = (row: number) =>
        row < rows.count ? (virtualizer.measurementsCache[row]?.start ?? 0) : virtualizer.getTotalSize();
    const revisionAt = (boundary: number) => revisionOf(Math.min(boundary, rows.count - 1));

    // A settled drag is over once the data behind its boundary row is reloaded.
    const settled = lastState?.settledAt !== undefined;
    const state = settled && revisionAt(lastState.boundary) !== lastState.settledAt ? null : lastState;

    const boundaryAt = (offset: number, source: DragSource) => {
        let hit = virtualizer.getVirtualItemForOffset(offset);
        if (!hit) return 0;
        // The collapsed block shares its start with the row after it.
        if (hit.index >= source.row && hit.index < source.row + source.rowCount)
            hit = virtualizer.measurementsCache[source.row + source.rowCount];
        if (!hit) return source.row;
        const boundary = offset < hit.start + hit.size / 2 ? hit.index : hit.index + 1;
        // Inside the block, or right after it, means no move.
        return boundary > source.row && boundary <= source.row + source.rowCount ? source.row : boundary;
    };

    const update = () => {
        const current = gesture.current;
        const scroll = scrollRef.current;
        if (!current || !scroll || current.aborted) return;
        const rect = scroll.getBoundingClientRect();
        const above = current.clientY - rect.top;
        const below = rect.bottom - current.clientY;
        if (above < edgeSize) scroll.scrollTop -= maxScrollStep * (1 - Math.max(above, 0) / edgeSize);
        else if (below < edgeSize) scroll.scrollTop += maxScrollStep * (1 - Math.max(below, 0) / edgeSize);

        const offset = current.clientY - rect.top + scroll.scrollTop;
        const boundary = boundaryAt(offset, current.source);
        // The list adds the ghost's height to its own, so the ghost fits at the very end.
        const top = Math.min(Math.max(offset - current.grab, 0), virtualizer.getTotalSize());
        if (boundary === current.boundary && top === current.top) return;
        current.boundary = boundary;
        current.top = top;
        setState({ source: current.source, boundary, top });
    };

    const finish = (cancelled: boolean) => {
        const current = gesture.current;
        gesture.current = null;
        if (!current) return;
        cancelAnimationFrame(current.frame);
        if (!current.started || current.aborted) return;
        const { source, boundary } = current;
        if (cancelled || boundary === source.row) {
            setState(null);
            return;
        }
        setState({ source, boundary, top: rowStart(boundary), settledAt: revisionAt(boundary) });
        onDrop(source.row, boundary);
    };

    const drag = usePointerDrag({
        axis: 'y',
        enabled,
        threshold: 4,
        onStart: (event: ReactPointerEvent) => {
            const row = pendingRow.current;
            pendingRow.current = null;
            const scroll = scrollRef.current;
            if (row === null || !scroll || gesture.current) return false;
            const span = rows.spanAt(row);
            const rowCount = rows.at(row).kind === 'group' && span ? span.rowCount : 1;
            // Captured by the list rather than the handle: a touch whose target leaves
            // the DOM is cancelled, and the dragged row unmounts as the list scrolls.
            scroll.setPointerCapture(event.pointerId);
            const offset = event.clientY - scroll.getBoundingClientRect().top + scroll.scrollTop;
            gesture.current = {
                source: { row, rowCount, ghostHeight: virtualizer.measurementsCache[row]?.size ?? 0 },
                grab: offset - rowStart(row),
                startClientY: event.clientY,
                clientY: event.clientY,
                boundary: row,
                top: rowStart(row),
                started: false,
                aborted: false,
                frame: 0,
            };
        },
        onMove: delta => {
            const current = gesture.current;
            if (!current || current.aborted) return;
            current.clientY = current.startClientY + delta;
            if (!current.started) {
                current.started = true;
                // The frame loop keeps scrolling while the pointer rests at an edge.
                const loop = () => {
                    update();
                    current.frame = requestAnimationFrame(loop);
                };
                current.frame = requestAnimationFrame(loop);
            }
            update();
        },
        onRelease: ({ cancelled }) => finish(cancelled),
    });

    useEffect(() => {
        const cancel = (event: KeyboardEvent) => {
            const current = gesture.current;
            if (event.key !== 'Escape' || !current?.started) return;
            current.aborted = true;
            cancelAnimationFrame(current.frame);
            setState(null);
        };
        window.addEventListener('keydown', cancel);
        return () => {
            window.removeEventListener('keydown', cancel);
            if (gesture.current) cancelAnimationFrame(gesture.current.frame);
        };
    }, []);

    const inBlock = (row: number) =>
        state !== null && row >= state.source.row && row < state.source.row + state.source.rowCount;

    return {
        state,
        settled: state !== null && settled,
        reset: () => setState(null),
        start: (row: number, event: ReactPointerEvent) => {
            pendingRow.current = row;
            drag.handlers.onPointerDown(event);
        },
        hidden: inBlock,
        // The rows from the boundary on make room for the ghost.
        shift: (row: number) => (state && !inBlock(row) && row >= state.boundary ? state.source.ghostHeight : 0),
    };
}

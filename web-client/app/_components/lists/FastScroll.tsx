'use client';

import { usePointerDrag } from '@/app/_hooks/usePointerDrag';
import type { Virtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import styles from './FastScroll.module.scss';
import type { PlaylistRows } from './playlistRows';

export type FastScrollProps = {
    // The list, the only child.
    scrollRef: RefObject<HTMLElement | null>;
    // Named beside the thumb while it is dragged: the group at the top of the list.
    label?: string;
    // Told as a drag of the thumb begins and ends: the rows the list keeps ready
    // around the viewport are of no use while every frame draws at the offset
    // it is given, and it may spare them.
    onDragChange?(dragging: boolean): void;
    children: ReactNode;
};

// The group at the top of a list, to name beside the thumb; a list of one
// group has nothing to tell apart.
export function topGroupName(
    rows: PlaylistRows,
    virtualizer: Pick<Virtualizer<Element, Element>, 'scrollOffset' | 'getVirtualItemForOffset'>,
): string | undefined {
    if (rows.groupCount < 2) return undefined;
    const top = virtualizer.getVirtualItemForOffset(virtualizer.scrollOffset ?? 0);
    return top && rows.groupAt(top.index)?.name;
}

// Pixels per line of a wheel that counts lines: about a row.
const wheelLine = 40;

type DragGeometry = { travel: number; range: number; from: number };

// A thumb to drag through a long list, as the player's Android app has, in
// place of the browser's scrollbar: shown whenever the list overflows.
export function FastScroll({ scrollRef, label, onDragChange, children }: FastScrollProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const thumbRef = useRef<HTMLDivElement | null>(null);
    const [overflowing, setOverflowing] = useState(false);
    // Where the thumb stands, 0 to 1. Written to the thumb itself rather than
    // rendered: a drag moves it on every frame, and the frame's budget is the rows'.
    const progress = useRef(0);
    // The thumb's travel and the list's, and where the thumb was, as a drag began.
    const geometry = useRef<DragGeometry | null>(null);

    const place = (next: number) => {
        progress.current = next;
        thumbRef.current?.style.setProperty('--progress', String(next));
    };
    const setThumb = useCallback((thumb: HTMLDivElement | null) => {
        thumbRef.current = thumb;
        thumb?.style.setProperty('--progress', String(progress.current));
    }, []);

    // The list redraws its parent as its rows change, which redraws this. Its
    // size is read once a frame, just before the frame is drawn: reading it lays
    // the list out, and in the commit or the scroll event that would be done
    // while the list is still changing, and done again.
    useLayoutEffect(() => {
        const list = scrollRef.current;
        if (!list) return;
        let frame = 0;
        const follow = () => {
            frame = 0;
            const range = list.scrollHeight - list.clientHeight;
            setOverflowing(range > 0);
            if (range > 0 && !geometry.current) place(Math.min(list.scrollTop / range, 1));
        };
        const schedule = () => {
            frame ||= requestAnimationFrame(follow);
        };
        schedule();
        list.addEventListener('scroll', schedule, { passive: true });
        return () => {
            list.removeEventListener('scroll', schedule);
            cancelAnimationFrame(frame);
        };
    });

    // The thumb lies over the list, not in it: a wheel over it is handed on.
    useEffect(() => {
        const thumb = thumbRef.current;
        if (!thumb) return;
        const onWheel = (event: WheelEvent) => {
            const list = scrollRef.current;
            if (!list) return;
            event.preventDefault();
            const unit =
                event.deltaMode === WheelEvent.DOM_DELTA_LINE
                    ? wheelLine
                    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
                      ? list.clientHeight
                      : 1;
            list.scrollBy({ top: event.deltaY * unit });
        };
        thumb.addEventListener('wheel', onWheel, { passive: false });
        return () => thumb.removeEventListener('wheel', onWheel);
    }, [overflowing, scrollRef]);

    const drag = usePointerDrag({
        axis: 'y',
        // From the first pixel, as a scrollbar's thumb.
        threshold: 0,
        onStart: () => {
            const list = scrollRef.current;
            const travel = (trackRef.current?.clientHeight ?? 0) - (thumbRef.current?.offsetHeight ?? 0);
            if (!list || travel <= 0) return false;
            geometry.current = { travel, range: list.scrollHeight - list.clientHeight, from: progress.current };
        },
        onMove: delta => {
            const list = scrollRef.current;
            const drag = geometry.current;
            if (!list || !drag) return;
            const next = Math.min(Math.max(drag.from + delta / drag.travel, 0), 1);
            place(next);
            list.scrollTop = next * drag.range;
            // The browser would tell the list of its new offset only in the next
            // frame, after this one is drawn with the rows of the old one; told
            // now, the list draws this frame with the rows of this offset.
            list.dispatchEvent(new Event('scroll'));
        },
        onRelease: () => {
            geometry.current = null;
        },
    });

    useEffect(() => {
        onDragChange?.(drag.dragging);
    }, [drag.dragging, onDragChange]);

    return (
        <div className={styles.frame} data-testid="fast-scroll">
            {children}
            <div ref={trackRef} className={styles.track} aria-hidden>
                {overflowing && (
                    <div
                        ref={setThumb}
                        className={clsx(styles.thumb, drag.dragging && styles.dragging)}
                        data-testid="scroll-thumb"
                        onPointerDown={event => {
                            // The pager under the list would take it for a swipe, and
                            // a mouse would select the text it passes.
                            event.stopPropagation();
                            event.preventDefault();
                            drag.handlers.onPointerDown(event);
                        }}
                    >
                        {drag.dragging && label && (
                            <span className={styles.label} data-testid="scroll-label">
                                {label}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

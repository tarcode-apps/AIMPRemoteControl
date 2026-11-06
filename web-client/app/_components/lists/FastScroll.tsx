'use client';

import { usePointerDrag } from '@/app/_hooks/usePointerDrag';
import type { Virtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import styles from './FastScroll.module.scss';
import type { PlaylistRows } from './playlistRows';

export type FastScrollProps = {
    // The list, the only child.
    scrollRef: RefObject<HTMLElement | null>;
    // Named beside the thumb while it is dragged: the group at the top of the list.
    label?: string;
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

// A thumb to drag through a long list, as the player's Android app has, in
// place of the browser's scrollbar: shown whenever the list overflows.
export function FastScroll({ scrollRef, label, children }: FastScrollProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const thumbRef = useRef<HTMLDivElement>(null);
    const [progress, setProgress] = useState<number | null>(null);
    const startTop = useRef(0);

    // The list redraws its parent as its rows change, which redraws this.
    useLayoutEffect(() => {
        const list = scrollRef.current;
        if (!list) return;
        const place = () => {
            const range = list.scrollHeight - list.clientHeight;
            setProgress(range > 0 ? Math.min(list.scrollTop / range, 1) : null);
        };
        place();
        list.addEventListener('scroll', place, { passive: true });
        return () => list.removeEventListener('scroll', place);
    });

    const drag = usePointerDrag({
        axis: 'y',
        onStart: () => {
            if (!scrollRef.current) return false;
            startTop.current = scrollRef.current.scrollTop;
        },
        onMove: delta => {
            const list = scrollRef.current;
            const travel = (trackRef.current?.clientHeight ?? 0) - (thumbRef.current?.offsetHeight ?? 0);
            if (!list || travel <= 0) return;
            list.scrollTop = startTop.current + (delta * (list.scrollHeight - list.clientHeight)) / travel;
        },
        onRelease: () => {},
    });

    return (
        <div className={styles.frame}>
            {children}
            <div ref={trackRef} className={styles.track} aria-hidden>
                {progress !== null && (
                    <div
                        ref={thumbRef}
                        className={styles.thumb}
                        style={{ '--progress': progress } as CSSProperties}
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

import { usePointerDrag } from '@/app/_hooks/usePointerDrag';
import { useRef, type RefObject } from 'react';

const flingVelocity = 0.5;

export type SheetDragOptions = {
    panelRef: RefObject<HTMLElement | null>;
    handleRef: RefObject<HTMLElement | null>;
    expanded: boolean;
    enabled: boolean;
    // The sheet starts following the pointer; a tap does not get here.
    onPull(): void;
    onExpand(): void;
    onCollapse(): void;
};

export function useSheetDrag({
    panelRef,
    handleRef,
    expanded,
    enabled,
    onPull,
    onExpand,
    onCollapse,
}: SheetDragOptions) {
    const range = useRef({ base: 0, max: 0, pulled: false });
    const panelRange = () => {
        const panel = panelRef.current;
        const handle = handleRef.current;
        if (!panel || !handle) return null;
        const toolbar = parseFloat(getComputedStyle(document.body).getPropertyValue('--toolbar-height')) || 0;
        return panel.offsetHeight - handle.offsetHeight - toolbar;
    };

    const clamp = (offset: number) => Math.min(Math.max(offset, 0), range.current.max);

    return usePointerDrag({
        axis: 'y',
        enabled,
        onStart: () => {
            const max = panelRange();
            if (max === null) return false;
            range.current = { base: expanded ? 0 : max, max, pulled: false };
        },
        onMove: delta => {
            const panel = panelRef.current;
            // The keyboard closing as the drag starts gives the sheet more room; the
            // start stays where it was taken, under the finger.
            const max = panelRange();
            if (!panel || max === null) return;
            range.current.max = max;
            if (!range.current.pulled) {
                range.current.pulled = true;
                onPull();
            }
            const offset = clamp(range.current.base + delta);
            panel.style.setProperty('--sheet-offset', `${offset}px`);
            panel.style.setProperty('--sheet-progress', `${1 - offset / range.current.max}`);
        },
        onRelease: ({ delta, velocity, cancelled }) => {
            let open = expanded;
            if (!cancelled) {
                if (Math.abs(velocity) > flingVelocity) open = velocity < 0;
                else open = clamp(range.current.base + delta) < range.current.max / 2;
            }
            if (open) onExpand();
            else onCollapse();
        },
        onDragEnd: () => {
            const panel = panelRef.current;
            panel?.style.removeProperty('--sheet-offset');
            panel?.style.removeProperty('--sheet-progress');
        },
    });
}

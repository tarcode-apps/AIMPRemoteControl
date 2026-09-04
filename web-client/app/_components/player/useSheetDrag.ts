import { usePointerDrag } from '@/app/_hooks/usePointerDrag';
import { useRef, type RefObject } from 'react';

const flingVelocity = 0.5;

export type SheetDragOptions = {
    panelRef: RefObject<HTMLElement | null>;
    handleRef: RefObject<HTMLElement | null>;
    expanded: boolean;
    enabled: boolean;
    onExpand(): void;
    onCollapse(): void;
};

export function useSheetDrag({ panelRef, handleRef, expanded, enabled, onExpand, onCollapse }: SheetDragOptions) {
    const range = useRef({ base: 0, max: 0 });

    const clamp = (offset: number) => Math.min(Math.max(offset, 0), range.current.max);

    return usePointerDrag({
        axis: 'y',
        enabled,
        onStart: () => {
            const panel = panelRef.current;
            const handle = handleRef.current;
            if (!panel || !handle) return false;
            const toolbar = parseFloat(getComputedStyle(document.body).getPropertyValue('--toolbar-height')) || 0;
            const max = panel.offsetHeight - handle.offsetHeight - toolbar;
            range.current = { base: expanded ? 0 : max, max };
        },
        onMove: delta => {
            const panel = panelRef.current;
            if (!panel) return;
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

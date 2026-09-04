import { usePointerDrag } from '@/app/_hooks/usePointerDrag';
import { useRef, type RefObject } from 'react';

const edgeWidth = 24;
const edgeHoldDelay = 300;
const peekWidth = 16;
const flingVelocity = 0.5;

export type DrawerGesturesOptions = {
    containerRef: RefObject<HTMLElement | null>;
    drawerRef: RefObject<HTMLElement | null>;
    enabled: boolean;
    opened: boolean;
    open(): void;
    close(): void;
};

export function useDrawerGestures({ containerRef, drawerRef, enabled, opened, open, close }: DrawerGesturesOptions) {
    const width = () => drawerRef.current?.offsetWidth ?? 0;

    const apply = (offset: number) => {
        const container = containerRef.current;
        const w = width();
        if (!container || !w) return;
        const clamped = Math.min(Math.max(offset, -w), 0);
        container.style.setProperty('--drawer-offset', `${clamped}px`);
        container.style.setProperty('--drawer-progress', `${1 + clamped / w}`);
    };

    const clearOffset = () => {
        const container = containerRef.current;
        container?.style.removeProperty('--drawer-offset');
        container?.style.removeProperty('--drawer-progress');
    };

    // Android reserves the screen edge for the system back gesture; a touch that stays
    // still there long enough is handed to the app, so the drawer waits for that hold.
    const openDrag = usePointerDrag({
        axis: 'x',
        enabled: enabled && !opened,
        hold: edgeHoldDelay,
        onStart: event => {
            if (event.clientX > edgeWidth) return false;
            event.stopPropagation();
        },
        onHold: () => apply(peekWidth - width()),
        onMove: delta => apply(delta + peekWidth - width()),
        onRelease: ({ delta, velocity, cancelled }) => {
            if (!cancelled && (velocity > flingVelocity || delta > width() / 2)) open();
        },
        onDragEnd: clearOffset,
    });

    // A finger that starts beside the drawer only pushes it once it reaches its edge.
    const push = useRef({ start: 0, edge: 0, offset: 0 });
    const closeDrag = usePointerDrag({
        axis: 'x',
        enabled: enabled && opened,
        onStart: event => {
            // Layout width rather than the bounding rect: the drawer may still be sliding in.
            push.current = { start: event.clientX, edge: Math.min(event.clientX, width()), offset: 0 };
        },
        onMove: delta => {
            const { start, edge } = push.current;
            push.current.offset = Math.min(start + delta - edge, 0);
            apply(push.current.offset);
        },
        onRelease: ({ velocity, cancelled }) => {
            const { offset } = push.current;
            if (!cancelled && offset < 0 && (velocity < -flingVelocity || -offset > width() / 2)) close();
        },
        onDragEnd: clearOffset,
    });

    const active = opened ? closeDrag : openDrag;

    return {
        dragging: openDrag.dragging || closeDrag.dragging,
        containerHandlers: {
            onPointerDownCapture: active.handlers.onPointerDown,
            onClickCapture: active.handlers.onClickCapture,
        },
    };
}

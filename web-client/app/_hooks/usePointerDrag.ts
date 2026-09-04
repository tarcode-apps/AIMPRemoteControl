import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react';

export type DragRelease = {
    delta: number;
    velocity: number;
    cancelled: boolean;
};

export type PointerDragOptions = {
    axis: 'x' | 'y';
    enabled?: boolean;
    threshold?: number;
    // Milliseconds the pointer must stay still before a drag may begin; moving earlier
    // abandons the gesture.
    hold?: number;
    onStart?(event: ReactPointerEvent): boolean | void;
    onHold?(): void;
    onMove(delta: number): void;
    onRelease(release: DragRelease): void;
    // Called after the render that drops `dragging`, so that any inline offset can be
    // cleared without the element ever showing the dragging styles with no offset.
    onDragEnd?(): void;
};

type Gesture = {
    pointerId: number;
    start: number;
    startTime: number;
    // The gesture is on once the pointer travelled past the threshold or the hold elapsed.
    active: boolean;
    dragged: boolean;
    detach(): void;
};

export function usePointerDrag({
    axis,
    enabled = true,
    threshold = 8,
    hold = 0,
    onStart,
    onHold,
    onMove,
    onRelease,
    onDragEnd,
}: PointerDragOptions) {
    const [dragging, setDragging] = useState(false);
    const gesture = useRef<Gesture | null>(null);
    // Set when a drag ends; the click a mouse drag produces must not act, but a touch
    // drag produces none, so the next pointer down cancels it instead of a timer.
    const suppressClick = useRef<AbortController | null>(null);

    const cancelClickSuppression = () => {
        suppressClick.current?.abort();
        suppressClick.current = null;
    };

    const suppressNextClick = () => {
        cancelClickSuppression();
        const controller = new AbortController();
        window.addEventListener('pointerdown', cancelClickSuppression, { capture: true, signal: controller.signal });
        suppressClick.current = controller;
    };

    // Chrome keeps tracking a touch as a scroll gesture even where touch-action forbids
    // the scroll, and a tap that interrupts the resulting fling never becomes a click.
    // Consuming the moves marks the sequence as handled. Whether a sequence is cancelable
    // at all is decided at touchstart from the listeners present then, so this one is
    // registered for the lifetime of the hook rather than per gesture.
    useEffect(() => {
        const consumeTouch = (event: TouchEvent) => {
            if (gesture.current?.dragged) event.preventDefault();
        };
        window.addEventListener('touchmove', consumeTouch, { passive: false });
        return () => {
            window.removeEventListener('touchmove', consumeTouch);
            gesture.current?.detach();
            cancelClickSuppression();
        };
    }, []);

    useEffect(() => {
        if (!dragging) onDragEnd?.();
    }, [dragging, onDragEnd]);

    const position = (event: { clientX: number; clientY: number }) => (axis === 'x' ? event.clientX : event.clientY);

    const onPointerDown = (event: ReactPointerEvent) => {
        if (!enabled || event.button !== 0 || gesture.current) return;
        if (onStart?.(event) === false) return;

        const holdTimer = hold
            ? window.setTimeout(() => {
                  current.active = true;
                  setDragging(true);
                  onHold?.();
              }, hold)
            : undefined;
        const current: Gesture = {
            pointerId: event.pointerId,
            start: position(event),
            startTime: event.timeStamp,
            active: false,
            dragged: false,
            detach: () => {
                window.clearTimeout(holdTimer);
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                window.removeEventListener('pointercancel', cancel);
                window.removeEventListener('dragstart', preventNativeDrag);
            },
        };

        const finish = (end: PointerEvent, cancelled: boolean) => {
            if (end.pointerId !== current.pointerId) return;
            current.detach();
            gesture.current = null;
            if (!current.active) return;
            if (current.dragged) suppressNextClick();
            const delta = position(end) - current.start;
            setDragging(false);
            onRelease({ delta, velocity: delta / Math.max(end.timeStamp - current.startTime, 1), cancelled });
        };

        // Tracked on the window rather than the element: a fast mouse move can leave it
        // before the threshold is reached, and the button may be released outside it.
        const move = (event: PointerEvent) => {
            if (event.pointerId !== current.pointerId) return;
            if ((event.buttons & 1) === 0) return finish(event, true);
            const delta = position(event) - current.start;
            if (!current.dragged) {
                if (Math.abs(delta) < threshold) return;
                if (hold && !current.active) {
                    current.detach();
                    gesture.current = null;
                    return;
                }
                current.dragged = true;
            }
            if (!current.active) {
                current.active = true;
                setDragging(true);
            }
            onMove(delta);
        };
        const up = (event: PointerEvent) => finish(event, false);
        const cancel = (event: PointerEvent) => finish(event, true);
        // A mouse moving over a link or image would start native drag-and-drop, and the
        // browser cancels pointer events when that happens.
        const preventNativeDrag = (event: DragEvent) => event.preventDefault();
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', cancel);
        window.addEventListener('dragstart', preventNativeDrag);
        gesture.current = current;
    };

    const onClickCapture = (event: SyntheticEvent) => {
        if (!suppressClick.current) return;
        cancelClickSuppression();
        event.stopPropagation();
        event.preventDefault();
    };

    return {
        dragging,
        handlers: { onPointerDown, onClickCapture },
    };
}

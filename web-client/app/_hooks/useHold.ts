import { useEffect, useRef, useState, type PointerEvent } from 'react';

// What a button does when held instead of clicked.
export type HoldAction = {
    delay: number;
    // Fires again this often while the hold lasts.
    repeat?: number;
    action(): void;
};

// A press that lasts `delay` fires `onHold` instead of a click, then again every
// `repeat` milliseconds while it lasts; the click that ends it is reported by
// `endedHold` so the button can ignore it.
export function useHold(delay: number, onHold: () => void, repeat?: number) {
    const [pressed, setPressed] = useState(false);
    const timer = useRef<number | undefined>(undefined);
    const held = useRef(false);

    const stop = () => {
        window.clearTimeout(timer.current);
        window.clearInterval(timer.current);
    };
    useEffect(() => stop, []);

    return {
        pressed,
        press(event: PointerEvent<HTMLElement>) {
            if (event.button !== 0 || ('disabled' in event.currentTarget && event.currentTarget.disabled)) return;
            held.current = false;
            setPressed(true);
            timer.current = window.setTimeout(() => {
                held.current = true;
                onHold();
                if (repeat) timer.current = window.setInterval(onHold, repeat);
            }, delay);
        },
        release() {
            stop();
            setPressed(false);
        },
        endedHold() {
            const result = held.current;
            held.current = false;
            return result;
        },
    };
}

type PointerAt = { clientX: number; clientY: number };

// A press held in place, as a long press on a mobile: it fires the action given
// to `start` after `delay`, unless the pointer travels further than `slop`
// first, which makes it a drag or a scroll.
export function useHoldInPlace(slop: number, delay = 500) {
    const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
    const cancel = () => {
        if (hold.current) window.clearTimeout(hold.current.timer);
        hold.current = null;
    };
    useEffect(() => cancel, []);

    return {
        start({ clientX, clientY }: PointerAt, action: () => void) {
            cancel();
            hold.current = {
                x: clientX,
                y: clientY,
                timer: window.setTimeout(() => {
                    hold.current = null;
                    action();
                }, delay),
            };
        },
        // Whether the press is still held in place; one that wandered off is cancelled.
        move({ clientX, clientY }: PointerAt): boolean {
            const start = hold.current;
            if (!start) return false;
            if (Math.hypot(clientX - start.x, clientY - start.y) <= slop) return true;
            cancel();
            return false;
        },
        cancel,
    };
}

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
        press(event: PointerEvent<HTMLButtonElement>) {
            if (event.button !== 0 || event.currentTarget.disabled) return;
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

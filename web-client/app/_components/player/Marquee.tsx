'use client';

import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import clsx from 'clsx';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './Marquee.module.scss';

// Per second, in the text's own font size: the pace is the same in letters.
const speed = 1;
const rest = 2000; // milliseconds at either end

export type MarqueeProps = {
    className?: string;
    children: ReactNode;
};

// Text that does not fit scrolls back and forth at a steady pace, resting at
// either end; text that fits, or where motion is reduced, is cut with an ellipsis.
export function Marquee({ className, children }: MarqueeProps) {
    const box = useRef<HTMLSpanElement>(null);
    const text = useRef<HTMLSpanElement>(null);
    const [overflow, setOverflow] = useState(0);
    const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
    const scrolling = overflow > 0 && !reducedMotion;

    // The box resizing is observed; the text is measured again when it changes,
    // as while cut it keeps the box's width.
    useEffect(() => {
        const measure = () => setOverflow(Math.max(0, text.current!.scrollWidth - box.current!.clientWidth));
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(box.current!);
        return () => observer.disconnect();
    }, [children]);

    useEffect(() => {
        if (!scrolling) return;
        // Each run rests half the time at each end, and the runs alternate.
        const fontSize = parseFloat(getComputedStyle(text.current!).fontSize);
        const total = (overflow / (speed * fontSize)) * 1000 + rest;
        const edge = rest / 2 / total;
        const animation = text.current!.animate(
            [
                { transform: 'translateX(0)', offset: 0 },
                { transform: 'translateX(0)', offset: edge },
                { transform: `translateX(${-overflow}px)`, offset: 1 - edge },
                { transform: `translateX(${-overflow}px)`, offset: 1 },
            ],
            { duration: total, iterations: Infinity, direction: 'alternate', easing: 'linear' },
        );
        return () => animation.cancel();
    }, [scrolling, overflow]);

    return (
        <span ref={box} className={clsx(styles.marquee, className)}>
            <span ref={text} className={clsx(styles.text, scrolling && styles.scrolling)}>
                {children}
            </span>
        </span>
    );
}

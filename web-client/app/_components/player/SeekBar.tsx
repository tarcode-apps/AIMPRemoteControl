'use client';

import { usePointerDrag } from '@/app/_hooks/usePointerDrag';
import clsx from 'clsx';
import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import styles from './SeekBar.module.scss';

const keyStep = 5;

export type SeekBarProps = {
    title: string;
    value: number;
    max: number;
    className?: string;
    onCommit(value: number): void;
};

// A line that seeks on a tap or a sideways drag and leaves an upward drag to the
// sheet under it: unlike a range input, it does nothing on the pointer down itself.
export function SeekBar({ title, value, max, className, onCommit }: SeekBarProps) {
    const bar = useRef<HTMLDivElement>(null);
    const startX = useRef(0);
    const enabled = max > 0;
    const valueAt = (clientX: number) => {
        const rect = bar.current!.getBoundingClientRect();
        return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * max;
    };
    const drag = usePointerDrag({
        axis: 'x',
        enabled,
        onStart: event => {
            startX.current = event.clientX;
        },
        onMove: delta => setLocal(valueAt(startX.current + delta)),
        onRelease: ({ delta, cancelled }) => {
            if (cancelled) setLocal(null);
            else seek(valueAt(startX.current + delta));
        },
    });
    // The user's value stays on screen while dragging and until the next value
    // arrives after the commit, so nothing jumps back in between.
    const [local, setLocal] = useState<number | null>(null);
    const [seen, setSeen] = useState(value);
    if (value !== seen) {
        setSeen(value);
        if (!drag.dragging) setLocal(null);
    }
    const shown = local ?? value;

    const seek = (next: number) => {
        setLocal(next);
        onCommit(next);
    };

    const onKeyDown = (event: KeyboardEvent) => {
        const targets: Record<string, number> = {
            ArrowLeft: shown - keyStep,
            ArrowRight: shown + keyStep,
            Home: 0,
            End: max,
        };
        const next = targets[event.key];
        if (next === undefined) return;
        event.preventDefault();
        seek(Math.min(Math.max(next, 0), max));
    };

    return (
        <div
            ref={bar}
            role="slider"
            tabIndex={enabled ? 0 : -1}
            title={title}
            aria-label={title}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-valuenow={shown}
            aria-disabled={!enabled || undefined}
            className={clsx(styles.seekBar, className)}
            style={{ '--fill': `${enabled ? (shown / max) * 100 : 0}%` } as CSSProperties}
            {...drag.handlers}
            onClick={event => enabled && seek(valueAt(event.clientX))}
            onKeyDown={enabled ? onKeyDown : undefined}
        />
    );
}

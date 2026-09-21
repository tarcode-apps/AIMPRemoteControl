'use client';

import clsx from 'clsx';
import { useState, type CSSProperties } from 'react';
import styles from './Slider.module.scss';

export type SliderProps = {
    title: string;
    value: number;
    max: number;
    step?: number;
    className?: string;
    // Every change while the user moves the thumb.
    onChange?(value: number): void;
    // The value the user let go at.
    onCommit(value: number): void;
};

export function Slider({ title, value, max, step = 1, className, onChange, onCommit }: SliderProps) {
    // The user's value stays on screen from the first move until the next value
    // arrives after the commit, so nothing jumps back in between.
    const [local, setLocal] = useState<number | null>(null);
    const [editing, setEditing] = useState(false);
    const [seen, setSeen] = useState(value);
    if (value !== seen) {
        setSeen(value);
        if (!editing) setLocal(null);
    }
    const shown = local ?? value;

    const commit = () => {
        if (!editing) return;
        setEditing(false);
        if (local !== null) onCommit(local);
    };

    return (
        <input
            type="range"
            min={0}
            max={max}
            step={step}
            value={shown}
            aria-label={title}
            title={title}
            className={clsx(styles.slider, className)}
            style={{ '--fill': `${max > 0 ? (shown / max) * 100 : 0}%` } as CSSProperties}
            onChange={event => {
                const next = Number(event.target.value);
                setEditing(true);
                setLocal(next);
                onChange?.(next);
            }}
            // The sheet must not start dragging from the thumb.
            onPointerDown={event => event.stopPropagation()}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
        />
    );
}

'use client';

import { useHoldInPlace } from '@/app/_hooks/useHold';
import clsx from 'clsx';
import { useState, type CSSProperties, type PointerEvent } from 'react';
import styles from './Slider.module.scss';

export type SliderProps = {
    title: string;
    value: number;
    min?: number;
    max: number;
    step?: number;
    // Where the filled part of the track starts; the lower end without it.
    origin?: number;
    // Stands upright, as tall as its parent, with the maximum at the top.
    vertical?: boolean;
    // Shows the value without a thumb, as nothing can be set.
    disabled?: boolean;
    className?: string;
    // Every change while the user moves the thumb.
    onChange?(value: number): void;
    // The value the user let go at.
    onCommit(value: number): void;
    // A press held in place, as a long press on a phone, such as to reset the value.
    onHold?(): void;
};

// A pointer that travels further is dragging, not holding.
const holdSlop = 6;

export function Slider({
    title,
    value,
    min = 0,
    max,
    step = 1,
    origin = min,
    vertical = false,
    disabled = false,
    className,
    onChange,
    onCommit,
    onHold,
}: SliderProps) {
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

    const hold = useHoldInPlace(holdSlop);

    const onPointerDown = (event: PointerEvent<HTMLInputElement>) => {
        // The sheet must not start dragging from the thumb.
        event.stopPropagation();
        hold.cancel();
        if (!onHold || event.button !== 0) return;
        // What the press moved is dropped: the hold decides the value.
        hold.start(event, () => {
            setEditing(false);
            setLocal(null);
            onHold();
        });
    };

    const percent = (at: number) => (max > min ? ((at - min) / (max - min)) * 100 : 0);
    const [fillStart, fillEnd] = [percent(Math.min(origin, shown)), percent(Math.max(origin, shown))];
    const input = (
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={shown}
            disabled={disabled}
            aria-label={title}
            aria-orientation={vertical ? 'vertical' : undefined}
            title={title}
            className={clsx(styles.slider, vertical ? styles.upright : className)}
            style={{ '--fill-start': `${fillStart}%`, '--fill-end': `${fillEnd}%` } as CSSProperties}
            onChange={event => {
                const next = Number(event.target.value);
                setEditing(true);
                setLocal(next);
                onChange?.(next);
            }}
            onPointerDown={onPointerDown}
            onPointerMove={event => hold.move(event)}
            onPointerUp={() => {
                hold.cancel();
                commit();
            }}
            onPointerCancel={hold.cancel}
            onContextMenu={event => onHold && event.preventDefault()}
            onKeyUp={commit}
            onBlur={commit}
        />
    );
    return vertical ? <span className={clsx(styles.vertical, className)}>{input}</span> : input;
}

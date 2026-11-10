'use client';

import clsx from 'clsx';
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../icons';
import styles from './Rating.module.scss';

const stars = [1, 2, 3, 4, 5];
// The part of the first slot where a press takes the mark away, as in the player.
const clearingPart = 0.25;

export type RatingProps = {
    // The stars the user gave, 0..5.
    mark: number;
    // The player's own rating of the track, 0..1.
    rating: number;
    // The stars the player shows, in halves: the mark, or the rating as stars when
    // there is none, drawn hollow.
    displayingMark: number;
    // Sets the mark; without it the stars are only shown. A press sets the star
    // under the pointer, which may slide along the stars before it lets go.
    onChange?(mark: number): void;
    // Small as in a row, or large as in a bar.
    size?: 'row' | 'bar';
    className?: string;
};

// Five slots, as the player draws them: a dot for a star nobody gave, a star
// part filled for a rating between two.
export function Rating({ mark, rating, displayingMark, onChange, size = 'row', className }: RatingProps) {
    const { t } = useTranslation();
    const strip = useRef<HTMLSpanElement>(null);
    const pressed = useRef(false);
    // The stars under the pointer, before it lets go.
    const [preview, setPreview] = useState<number | null>(null);
    // The mark just given, shown until the props catch up with it, which takes a
    // render during which the old stars would flash.
    const [given, setGiven] = useState<number | null>(null);
    const [seen, setSeen] = useState({ mark, rating, displayingMark });
    if (seen.mark !== mark || seen.rating !== rating || seen.displayingMark !== displayingMark) {
        setSeen({ mark, rating, displayingMark });
        setGiven(null);
    }
    const chosen = preview ?? given ?? mark;
    // A mark just taken away gives way to the rating before the player says so.
    const ratingStars = given === null ? displayingMark : rating * stars.length;
    const hollow = preview === null && chosen === 0 && ratingStars > 0;
    const shown = hollow ? ratingStars : chosen;

    const markAt = (clientX: number) => {
        const rect = strip.current!.getBoundingClientRect();
        const slot = rect.width / stars.length;
        const x = clientX - rect.left;
        return x < slot * clearingPart ? 0 : Math.min(stars.length, Math.max(1, Math.floor(x / slot) + 1));
    };
    const give = (value: number) => {
        setPreview(null);
        setGiven(value);
        onChange?.(value);
    };

    const onPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
        if (!onChange || event.button !== 0) return;
        // The sheet under the bar would take the press as a pull.
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        pressed.current = true;
        setPreview(markAt(event.clientX));
    };
    const onPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
        if (!onChange) return;
        if (pressed.current || event.pointerType === 'mouse') setPreview(markAt(event.clientX));
    };
    const onPointerUp = (event: PointerEvent<HTMLSpanElement>) => {
        if (!pressed.current) return;
        pressed.current = false;
        give(markAt(event.clientX));
    };
    // The browser takes a touch over now and then, as the finger reaches the edge
    // of the screen for one; the stars it had slid to are what was meant.
    const onPointerCancel = () => {
        if (!pressed.current) return;
        pressed.current = false;
        if (preview !== null) give(preview);
    };
    const onPointerLeave = () => {
        if (!pressed.current) setPreview(null);
    };
    const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
        if (!onChange) return;
        let next: number;
        switch (event.key) {
            case 'ArrowRight':
            case 'ArrowUp':
                next = Math.min(stars.length, mark + 1);
                break;
            case 'ArrowLeft':
            case 'ArrowDown':
                next = Math.max(0, mark - 1);
                break;
            case 'Home':
                next = 0;
                break;
            case 'End':
                next = stars.length;
                break;
            default:
                return;
        }
        event.preventDefault();
        // A pointer resting on the stars must not hide what the keys do.
        if (next === mark) setPreview(null);
        else give(next);
    };

    return (
        <span
            ref={strip}
            className={clsx(styles.rating, styles[size], onChange && styles.editable, className)}
            role={onChange ? 'slider' : 'img'}
            aria-label={t('rating.title')}
            aria-valuemin={onChange ? 0 : undefined}
            aria-valuemax={onChange ? stars.length : undefined}
            aria-valuenow={onChange ? mark : undefined}
            aria-valuetext={t('rating.value', { value: mark })}
            title={t('rating.value', { value: mark })}
            tabIndex={onChange && size === 'bar' ? 0 : undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onPointerLeave={onPointerLeave}
            onKeyDown={onKeyDown}
            // The row's own clicks would play the track; stars that only show pass
            // the tap on as any other part of the row.
            onClick={onChange && (event => event.stopPropagation())}
            onDoubleClick={onChange && (event => event.stopPropagation())}
        >
            {stars.map(star => {
                const fill = Math.min(1, Math.max(0, shown - (star - 1)));
                const partial = fill > 0 && fill < 1;
                return (
                    <span
                        key={star}
                        className={clsx(styles.slot, fill > 0 && (hollow ? styles.hollow : styles.filled))}
                    >
                        {partial && <Icon className={styles.outline}>star</Icon>}
                        {fill > 0 && (
                            <Icon
                                className={styles.star}
                                style={
                                    partial
                                        ? ({ clipPath: `inset(0 ${(1 - fill) * 100}% 0 0)` } as CSSProperties)
                                        : undefined
                                }
                            >
                                star
                            </Icon>
                        )}
                    </span>
                );
            })}
        </span>
    );
}

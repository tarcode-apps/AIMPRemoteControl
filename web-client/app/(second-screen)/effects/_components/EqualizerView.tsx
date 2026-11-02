'use client';

import type { EffectsPatch, EffectsState, EqualizerBand } from '@/app/_api/types';
import { Slider } from '@/app/_components/inputs';
import { useElementSize } from '@/app/_hooks/useElementSize';
import clsx from 'clsx';
import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Effects.module.scss';
import { formatBalance, formatDecibels, formatFrequency, formatGain } from './format';

const gainRange = 15;
const minGain = -gainRange;
const gainStep = 0.1;
const keyStep = 0.5;
const pageStep = 3;
const pointRadius = 4;
// Room for a point at either end of the gain axis.
const plotPadding = pointRadius + 4;
const holdDelay = 500;
// A pointer that travels further is drawing, not holding.
const holdSlop = 6;
// A column must hold a label such as "11.2 k"; where it cannot, the bands stack
// as rows, as the player's Android app does in portrait.
const horizontalFrom = 720;

type BandChange = { index: number; gain: number };
type BandPoint = BandChange;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const roundGain = (gain: number) => clamp(Math.round(gain / gainStep) * gainStep, -gainRange, gainRange);

// The bands a stroke passed over between two readings get the gains in between,
// so that a fast finger draws a line rather than steps.
function stroke(from: BandPoint, to: BandPoint): BandChange[] {
    const changes: BandChange[] = [];
    const direction = Math.sign(to.index - from.index);
    for (let index = from.index + direction; index !== to.index; index += direction) {
        const fraction = (index - from.index) / (to.index - from.index);
        changes.push({ index, gain: roundGain(from.gain + (to.gain - from.gain) * fraction) });
    }
    changes.push(to);
    return changes;
}

export type EqualizerViewProps = {
    state: EffectsState;
    set(patch: EffectsPatch): void;
};

// The balance, the bands and the preamp, laid out as rows on a portrait screen
// and as columns on a wide one.
export function EqualizerView({ state, set }: EqualizerViewProps) {
    const { t, i18n } = useTranslation();
    const container = useRef<HTMLDivElement>(null);
    const { width, height } = useElementSize(container);
    const horizontal = width >= horizontalFrom && width > height;
    const { equalizer } = state;

    return (
        <div
            ref={container}
            className={clsx(styles.equalizer, horizontal && styles.horizontal, !equalizer.active && styles.inactive)}
            data-layout={horizontal ? 'horizontal' : 'vertical'}
        >
            <SideSlider
                area="balance"
                label={t('effects.balance')}
                value={state.balance}
                min={-1}
                max={1}
                step={0.01}
                ends={[t('effects.left'), t('effects.right')]}
                text={formatBalance(state.balance, t)}
                vertical={horizontal}
                onChange={balance => set({ balance })}
                onReset={() => set({ balance: 0 })}
            />
            <BandPlot
                bands={equalizer.bands}
                preamp={equalizer.preamp}
                horizontal={horizontal}
                onChange={bands => set({ equalizer: { bands } })}
            />
            <SideSlider
                area="preamp"
                label={t('effects.preamp')}
                value={equalizer.preamp}
                min={-gainRange}
                max={gainRange}
                step={gainStep}
                ends={[formatDecibels(-gainRange, t, i18n.language), formatDecibels(gainRange, t, i18n.language)]}
                text={formatDecibels(equalizer.preamp, t, i18n.language)}
                vertical={horizontal}
                onChange={preamp => set({ equalizer: { preamp } })}
                onReset={() => set({ equalizer: { preamp: 0 } })}
            />
        </div>
    );
}

type SideSliderProps = {
    // Names its cells in the equalizer's grid.
    area: 'balance' | 'preamp';
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    // The texts at the low and the high end.
    ends: [ReactNode, ReactNode];
    text: string;
    vertical: boolean;
    onChange(value: number): void;
    onReset(): void;
};

// A slider with its name before and its value after, its ends at its sides; the
// parts are cells of the equalizer's grid.
function SideSlider({
    area,
    label,
    value,
    min,
    max,
    step,
    ends: [low, high],
    text,
    vertical,
    onChange,
    onReset,
}: SideSliderProps) {
    return (
        <>
            <span className={clsx(styles.sideLabel, styles[`${area}Label`])}>{label}</span>
            <span className={clsx(styles.sideRow, styles[`${area}Row`])}>
                <span className={clsx(styles.end, styles.low, styles[`${area}Low`])}>{low}</span>
                <Slider
                    title={label}
                    value={value}
                    min={min}
                    max={max}
                    step={step}
                    origin={0}
                    vertical={vertical}
                    className={styles.sideSlider}
                    onChange={onChange}
                    onCommit={onChange}
                    onHold={onReset}
                />
                <span className={clsx(styles.end, styles.high, styles[`${area}High`])}>{high}</span>
            </span>
            <span className={clsx(styles.sideValue, styles[`${area}Value`])}>{text}</span>
        </>
    );
}

type BandPlotProps = {
    bands: EqualizerBand[];
    preamp: number;
    horizontal: boolean;
    onChange(changes: BandChange[]): void;
};

// The curve of the bands: a point per band, dragged along the gain axis, or
// drawn over several bands in one stroke. Each point is a slider to the keyboard.
function BandPlot({ bands, preamp, horizontal, onChange }: BandPlotProps) {
    const { t, i18n } = useTranslation();
    const plot = useRef<HTMLDivElement>(null);
    const { width, height } = useElementSize(plot);
    const last = useRef<(BandPoint & { pointerId: number }) | null>(null);
    // A press held in place resets its band, as a held slider resets.
    const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
    const cancelHold = () => {
        if (hold.current) window.clearTimeout(hold.current.timer);
        hold.current = null;
    };
    useEffect(() => cancelHold, []);
    const count = bands.length;
    // Bands sit at the middle of equal slots along one axis, gains span the other.
    const along = horizontal ? width : height;
    const across = horizontal ? height : width;
    const slotAt = (index: number) => ((index + 0.5) * along) / count;
    const fractionOf = (gain: number) => (horizontal ? gainRange - gain : gain + gainRange) / (2 * gainRange);
    const gainAt = (gain: number) => plotPadding + fractionOf(gain) * (across - 2 * plotPadding);
    const pointOf = (index: number, gain: number): [number, number] =>
        horizontal ? [slotAt(index), gainAt(gain)] : [gainAt(gain), slotAt(index)];

    const read = (event: { clientX: number; clientY: number }): BandPoint => {
        const rect = plot.current!.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const index = clamp(Math.floor(((horizontal ? x : y) / along) * count), 0, count - 1);
        const fraction = clamp(((horizontal ? y : x) - plotPadding) / (across - 2 * plotPadding), 0, 1);
        const gain = horizontal ? gainRange - fraction * 2 * gainRange : fraction * 2 * gainRange - gainRange;
        return { index, gain: roundGain(gain) };
    };

    const change = (changes: BandChange[]) => {
        const changed = changes.filter(({ index, gain }) => bands[index].gain !== gain);
        if (changed.length) onChange(changed);
    };

    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || !along || !across) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const at = read(event);
        last.current = { ...at, pointerId: event.pointerId };
        change([at]);
        cancelHold();
        hold.current = {
            x: event.clientX,
            y: event.clientY,
            timer: window.setTimeout(() => {
                hold.current = null;
                last.current = null;
                onChange([{ index: at.index, gain: 0 }]);
            }, holdDelay),
        };
    };
    const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (!last.current || last.current.pointerId !== event.pointerId) return;
        const start = hold.current;
        if (start) {
            if (Math.hypot(event.clientX - start.x, event.clientY - start.y) <= holdSlop) return;
            cancelHold();
        }
        const at = read(event);
        const changes = stroke(last.current, at);
        last.current = { ...at, pointerId: event.pointerId };
        change(changes);
    };
    const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
        cancelHold();
        if (last.current?.pointerId === event.pointerId) last.current = null;
    };

    const onKeyDown = (index: number, event: KeyboardEvent) => {
        const steps: Record<string, number> = {
            ArrowUp: keyStep,
            ArrowRight: keyStep,
            ArrowDown: -keyStep,
            ArrowLeft: -keyStep,
            PageUp: pageStep,
            PageDown: -pageStep,
        };
        let gain;
        if (event.key === 'Home') gain = -gainRange;
        else if (event.key === 'End') gain = gainRange;
        else if (event.key in steps) gain = bands[index].gain + steps[event.key];
        else return;
        event.preventDefault();
        change([{ index, gain: roundGain(gain) }]);
    };

    // The level the bands meet the preamp at: raising the preamp lowers it.
    const zero = gainAt(clamp(-preamp, -gainRange, gainRange));
    const labels = bands.map(band => formatFrequency(band.frequency, t, i18n.language));
    return (
        <>
            <div className={styles.labels}>
                {labels.map((label, index) => (
                    <span key={index} className={styles.label}>
                        {label}
                    </span>
                ))}
            </div>
            <div
                ref={plot}
                className={styles.plot}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
                onContextMenu={event => event.preventDefault()}
                onDoubleClick={event => along && across && change([{ index: read(event).index, gain: 0 }])}
            >
                {along > 0 && across > 0 && (
                    <svg className={styles.canvas} width={width} height={height} aria-hidden="true">
                        {horizontal ? (
                            <line className={styles.zero} x1={0} x2={width} y1={zero} y2={zero} />
                        ) : (
                            <line className={styles.zero} x1={zero} x2={zero} y1={0} y2={height} />
                        )}
                        <polyline
                            className={styles.curve}
                            points={bands.map((band, index) => pointOf(index, band.gain).join(',')).join(' ')}
                        />
                        {bands.map((band, index) => {
                            const [cx, cy] = pointOf(index, band.gain);
                            return <circle key={index} className={styles.point} cx={cx} cy={cy} r={pointRadius} />;
                        })}
                    </svg>
                )}
                {bands.map((band, index) => {
                    const [left, top] = pointOf(index, band.gain);
                    return (
                        <div
                            key={index}
                            role="slider"
                            tabIndex={0}
                            aria-label={t('effects.band', { frequency: labels[index] })}
                            aria-valuemin={minGain}
                            aria-valuemax={gainRange}
                            aria-valuenow={band.gain}
                            aria-valuetext={formatDecibels(band.gain, t, i18n.language)}
                            className={styles.handle}
                            style={{ left, top }}
                            onKeyDown={event => onKeyDown(index, event)}
                        />
                    );
                })}
            </div>
            <div className={styles.values}>
                {bands.map((band, index) => (
                    <span key={index} className={styles.value}>
                        {formatGain(band.gain, i18n.language)}
                    </span>
                ))}
            </div>
        </>
    );
}

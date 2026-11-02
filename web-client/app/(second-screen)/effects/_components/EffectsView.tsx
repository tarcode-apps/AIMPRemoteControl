'use client';

import { effectsOff } from '@/app/_api/effects';
import type { EffectsPatch, EffectsState, SoundEffect } from '@/app/_api/types';
import { Slider } from '@/app/_components/inputs';
import clsx from 'clsx';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import styles from './Effects.module.scss';

type EffectRow = {
    name: SoundEffect;
    min: number;
    max: number;
    step: number;
    unit: 'percent' | 'rate' | 'signed';
};

// In the order of the player's own "Sound Effects: General" page.
const soundEffects: readonly EffectRow[] = [
    { name: 'echo', min: 0, max: 1, step: 0.01, unit: 'percent' },
    { name: 'reverb', min: 0, max: 1, step: 0.01, unit: 'percent' },
    { name: 'flanger', min: 0, max: 1, step: 0.01, unit: 'percent' },
    { name: 'chorus', min: 0, max: 1, step: 0.01, unit: 'percent' },
    { name: 'trueBass', min: 0, max: 2, step: 0.02, unit: 'percent' },
    { name: 'enhancer', min: 1, max: 5, step: 0.04, unit: 'percent' },
    { name: 'speed', min: 0.5, max: 3, step: 0.01, unit: 'rate' },
    { name: 'tempo', min: 0.5, max: 3, step: 0.01, unit: 'rate' },
    { name: 'pitch', min: -10, max: 10, step: 0.1, unit: 'signed' },
];

function formatEffect(row: EffectRow, value: number, t: TFunction, locale: string): string {
    switch (row.unit) {
        case 'percent':
            return t('effects.percent', { value: Math.round(((value - row.min) / (row.max - row.min)) * 100) });
        case 'rate':
            return t('effects.rate', {
                value: new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                    value,
                ),
            });
        case 'signed':
            return new Intl.NumberFormat(locale, {
                signDisplay: 'exceptZero',
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
            }).format(value);
    }
}

export type EffectsViewProps = {
    state: EffectsState;
    set(patch: EffectsPatch): void;
    className?: string;
};

export function EffectsView({ state, set, className }: EffectsViewProps) {
    const { t, i18n } = useTranslation();
    return (
        <div className={clsx(styles.effects, className)}>
            {soundEffects.map(row => {
                const label = t(`effects.names.${row.name}`);
                const value = state[row.name];
                return (
                    <div key={row.name} className={styles.effect}>
                        <span className={styles.sideLabel}>{label}</span>
                        <span className={styles.sideRow}>
                            <span className={styles.end}>{formatEffect(row, row.min, t, i18n.language)}</span>
                            <Slider
                                title={label}
                                value={value}
                                min={row.min}
                                max={row.max}
                                step={row.step}
                                origin={effectsOff[row.name]}
                                className={styles.sideSlider}
                                onChange={next => set({ [row.name]: next })}
                                onCommit={next => set({ [row.name]: next })}
                                onHold={() => set({ [row.name]: effectsOff[row.name] })}
                            />
                            <span className={styles.end}>{formatEffect(row, row.max, t, i18n.language)}</span>
                        </span>
                        <span className={styles.sideValue}>{formatEffect(row, value, t, i18n.language)}</span>
                    </div>
                );
            })}
        </div>
    );
}

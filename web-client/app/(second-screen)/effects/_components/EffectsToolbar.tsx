'use client';

import type { EffectsPatch, EffectsState } from '@/app/_api/types';
import { ToolbarButton } from '@/app/_components/buttons';
import { Icon } from '@/app/_components/icons';
import { Switch } from '@/app/_components/inputs';
import { Menu, menuSeparator, type MenuEntry } from '@/app/_components/menus';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import styles from './Effects.module.scss';

export type EffectsViewKind = 'equalizer' | 'effects';

export type EffectsToolbarProps = {
    view: EffectsViewKind;
    // Both views are on screen, so there is nothing to swap.
    combined: boolean;
    onViewChange(view: EffectsViewKind): void;
    state: EffectsState | undefined;
    set(patch: EffectsPatch): void;
    onPresets(): void;
    onSaveAs(): void;
    onResetEqualizer(): void;
    onResetEffects(): void;
};

// Fixed slots, as the lists have: the equalizer's switch and AUTO, a spare
// slot, the button that swaps the view, and the menu.
export function EffectsToolbar({
    view,
    combined,
    onViewChange,
    state,
    set,
    onPresets,
    onSaveAs,
    onResetEqualizer,
    onResetEffects,
}: EffectsToolbarProps) {
    const { t } = useTranslation();
    const equalizer = combined || view === 'equalizer';
    const presetItems: MenuEntry[] = [
        { label: t('effects.presets'), icon: 'list', onSelect: onPresets },
        { label: t('effects.saveAs'), icon: 'save', onSelect: onSaveAs },
    ];
    const auto = state?.equalizer.auto ?? false;

    return (
        <div className={styles.toolbar}>
            {equalizer ? (
                <>
                    <Switch
                        title={t('effects.enable')}
                        checked={state?.equalizer.active ?? false}
                        disabled={!state}
                        onChange={event => set({ equalizer: { active: event.target.checked } })}
                    />
                    <button
                        type="button"
                        className={clsx(styles.auto, auto && styles.autoOn)}
                        aria-pressed={auto}
                        title={t('effects.autoTitle')}
                        disabled={!state}
                        onClick={() => set({ equalizer: { auto: !auto } })}
                    >
                        {t('effects.auto')}
                    </button>
                </>
            ) : (
                <>
                    <span />
                    <span />
                </>
            )}
            <span />
            {combined ? (
                <span />
            ) : (
                <ToolbarButton
                    title={t(equalizer ? 'effects.showEffects' : 'effects.showEqualizer')}
                    className={clsx(!equalizer && styles.active)}
                    aria-pressed={!equalizer}
                    onClick={() => onViewChange(equalizer ? 'effects' : 'equalizer')}
                >
                    <Icon>graphic_eq</Icon>
                </ToolbarButton>
            )}
            <Menu
                title={t('effects.more')}
                icon="more_horiz"
                Button={ToolbarButton}
                disabled={!state}
                items={
                    // With both on screen, the equalizer's items stand apart from the effects'.
                    combined
                        ? [
                              ...presetItems,
                              { label: t('effects.resetEqualizer'), icon: 'restart_alt', onSelect: onResetEqualizer },
                              menuSeparator,
                              { label: t('effects.resetEffects'), icon: 'restart_alt', onSelect: onResetEffects },
                          ]
                        : equalizer
                          ? [
                                ...presetItems,
                                { label: t('effects.reset'), icon: 'restart_alt', onSelect: onResetEqualizer },
                            ]
                          : [{ label: t('effects.resetEffects'), icon: 'restart_alt', onSelect: onResetEffects }]
                }
            />
        </div>
    );
}

'use client';

import { effectsOff, useEffects, useSavePreset } from '@/app/_api/effects';
import { errorMessage } from '@/app/_api/helpers/errors';
import { Screen } from '@/app/_components/pages';
import screenStyles from '@/app/_components/pages/Screen.module.scss';
import { useElementSize } from '@/app/_hooks/useElementSize';
import { usePersistedState } from '@/app/_hooks/usePersistedState';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './_components/Effects.module.scss';
import { EffectsToolbar, type EffectsViewKind } from './_components/EffectsToolbar';
import { EffectsView } from './_components/EffectsView';
import { EqualizerView } from './_components/EqualizerView';
import { PresetNameDialog } from './_components/PresetNameDialog';
import { PresetsDialog } from './_components/PresetsDialog';
import { useEffectsEditor } from './_components/useEffectsEditor';

const parseView = (stored: unknown): EffectsViewKind | undefined =>
    stored === 'equalizer' || stored === 'effects' ? stored : undefined;

// Room for the equalizer as a band across the screen with the effects under it;
// with less, one of them fills the screen and the toolbar swaps them.
const combinedFrom = { width: 720, height: 600 };

export default function Effects() {
    const { t } = useTranslation();
    const { data, error } = useEffects();
    const editor = useEffectsEditor(data);
    const [view, setView] = usePersistedState<EffectsViewKind>('effects.view', 'equalizer', parseView);
    const [dialog, setDialog] = useState<'presets' | 'save' | null>(null);
    const savePreset = useSavePreset();
    const { state } = editor;
    const area = useRef<HTMLDivElement>(null);
    // Measured outside its scrollbar: the layout it decides must not change what
    // decides it.
    const size = useElementSize(area, 'border');
    const combined = size.width >= combinedFrom.width && size.height >= combinedFrom.height;
    const equalizer = combined || view === 'equalizer';

    const resetEqualizer = () =>
        state &&
        editor.set({ equalizer: { preamp: 0, bands: state.equalizer.bands.map((_, index) => ({ index, gain: 0 })) } });
    const resetEffects = () => editor.set({ ...effectsOff });

    return (
        <Screen
            title={t(combined || !equalizer ? 'screens.effects' : 'effects.equalizer')}
            subtitle={equalizer && state ? (state.equalizer.preset ?? t('effects.customPreset')) : undefined}
            notice={
                editor.error != null && <span className={screenStyles.noticeText}>{errorMessage(editor.error, t)}</span>
            }
            toolbar={
                <EffectsToolbar
                    view={view}
                    combined={combined}
                    onViewChange={setView}
                    state={state}
                    set={editor.set}
                    onPresets={() => setDialog('presets')}
                    onSaveAs={() => setDialog('save')}
                    onResetEqualizer={resetEqualizer}
                    onResetEffects={resetEffects}
                />
            }
        >
            <div ref={area} className={styles.area} data-view={combined ? 'combined' : view} data-testid="effects-area">
                {state ? (
                    combined ? (
                        <div className={styles.combined}>
                            <div className={styles.combinedEqualizer}>
                                <EqualizerView state={state} set={editor.set} />
                            </div>
                            <EffectsView state={state} set={editor.set} className={styles.combinedEffects} />
                        </div>
                    ) : equalizer ? (
                        <EqualizerView state={state} set={editor.set} />
                    ) : (
                        <EffectsView state={state} set={editor.set} />
                    )
                ) : (
                    error && <p className={styles.message}>{errorMessage(error, t)}</p>
                )}
            </div>
            {dialog === 'presets' && state && (
                <PresetsDialog equalizer={state.equalizer} onClose={() => setDialog(null)} />
            )}
            {dialog === 'save' && state && (
                <PresetNameDialog
                    title={t('effects.saveAs')}
                    initialName={state.equalizer.preset ?? ''}
                    onExisting="replace"
                    pending={savePreset.isPending}
                    error={savePreset.error}
                    onSubmit={name => savePreset.mutate(name, { onSuccess: () => setDialog(null) })}
                    onClose={() => setDialog(null)}
                />
            )}
        </Screen>
    );
}

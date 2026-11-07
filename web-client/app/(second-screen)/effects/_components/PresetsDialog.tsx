'use client';

import {
    receiveEffects,
    useApplyPreset,
    useEqualizerPresets,
    useRemovePreset,
    useRenamePreset,
    useSavePreset,
} from '@/app/_api/effects';
import { errorMessage } from '@/app/_api/helpers/errors';
import { request } from '@/app/_api/helpers/request';
import type { EffectsState, EqualizerState } from '@/app/_api/types';
import { IconButton, TextButton } from '@/app/_components/buttons';
import { Dialog } from '@/app/_components/dialogs';
import dialogStyles from '@/app/_components/dialogs/Dialog.module.scss';
import { Icon } from '@/app/_components/icons';
import { Radio } from '@/app/_components/inputs';
import { useErrorToast } from '@/app/_components/toast';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Effects.module.scss';
import { PresetNameDialog } from './PresetNameDialog';

type Action = { kind: 'replace' | 'rename' | 'remove'; name: string };

export type PresetsDialogProps = {
    // The equalizer as it was when the dialog opened.
    equalizer: EqualizerState;
    onClose(): void;
};

// The player's preset library over the equalizer, see-through as in the player's
// Android app: a chosen preset is applied at once, so that it can be heard and
// seen, OK keeps it and Cancel brings the equalizer back to how it was. The
// button in the title turns it into a list to manage the presets, opaque, where
// a preset can take the equalizer's curve, be renamed or be deleted.
export function PresetsDialog({ equalizer, onClose }: PresetsDialogProps) {
    const { t } = useTranslation();
    const showError = useErrorToast();
    const client = useQueryClient();
    const { data: presets, error } = useEqualizerPresets();
    const apply = useApplyPreset();
    const save = useSavePreset();
    const rename = useRenamePreset();
    const remove = useRemovePreset();
    const [managing, setManaging] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [action, setAction] = useState<Action | null>(null);
    const [chosen, setChosen] = useState(equalizer.preset);
    const [original] = useState(() => ({
        preset: equalizer.preset,
        curve: {
            preamp: equalizer.preamp,
            bands: equalizer.bands.map((band, index) => ({ index, gain: band.gain })),
        },
    }));
    // The presets are applied one after another, so that the last chosen wins and
    // the way back goes after all of them.
    const applying = useRef<Promise<unknown>>(Promise.resolve());
    const tried = useRef(false);
    const closed = useRef(false);
    const shownError = error ?? apply.error;

    const choose = (name: string) => {
        setChosen(name);
        tried.current = true;
        // Its error shows in the dialog (apply.error); the chain only orders the requests.
        applying.current = applying.current.then(() => apply.mutateAsync(name)).catch(() => undefined);
    };

    // Back to the curve the dialog opened on, once the presets chosen are applied.
    const restore = async () => {
        if (!tried.current) return;
        tried.current = false;
        await applying.current;
        receiveEffects(
            client,
            await request<EffectsState>('PATCH', '/effects', { body: { equalizer: original.curve } }),
        );
    };

    const finish = (keep: boolean) => {
        if (closed.current) return;
        closed.current = true;
        onClose();
        // The dialog is gone by then, so the toast tells of a curve left changed.
        if (!keep) void restore().catch(showError);
    };

    // Managing works on the curve the dialog opened on, so a preset that takes
    // the equalizer's curve takes that one.
    const toggleManaging = () => {
        if (managing) {
            setManaging(false);
            return;
        }
        setManaging(true);
        setChosen(original.preset);
        setRestoring(true);
        void restore()
            .catch(showError)
            .finally(() => setRestoring(false));
    };

    const confirm = () => {
        if (!action) return;
        const done = { onSuccess: () => setAction(null) };
        if (action.kind === 'replace') save.mutate(action.name, done);
        else if (action.kind === 'remove') remove.mutate(action.name, done);
    };
    const confirming = action?.kind === 'replace' || action?.kind === 'remove' ? action : null;
    const confirmError = confirming?.kind === 'replace' ? save.error : remove.error;

    return (
        <>
            <Dialog
                open
                title={t(managing ? 'effects.presets' : 'effects.loadPreset')}
                titleAction={
                    <IconButton
                        title={t('effects.managePresets')}
                        aria-pressed={managing}
                        className={styles.manageButton}
                        onClick={toggleManaging}
                    >
                        <Icon>edit_note</Icon>
                    </IconButton>
                }
                className={clsx(!managing && styles.translucent)}
                onClose={() => finish(false)}
                onSubmit={() => finish(true)}
                actions={
                    managing ? (
                        <TextButton type="submit">{t('actions.ok')}</TextButton>
                    ) : (
                        <>
                            <TextButton onClick={() => finish(false)}>{t('actions.cancel')}</TextButton>
                            <TextButton type="submit">{t('actions.ok')}</TextButton>
                        </>
                    )
                }
            >
                {presets?.length === 0 && <p className={styles.question}>{t('effects.noPresets')}</p>}
                {managing ? (
                    <ul className={styles.presetList}>
                        {presets?.map((preset, index) => (
                            <li key={index} className={styles.presetRow}>
                                <span className={styles.presetName}>{preset.name}</span>
                                <IconButton
                                    title={t('effects.replacePreset')}
                                    className={styles.presetAction}
                                    disabled={restoring}
                                    onClick={() => setAction({ kind: 'replace', name: preset.name })}
                                >
                                    <Icon>save</Icon>
                                </IconButton>
                                <IconButton
                                    title={t('effects.renamePreset')}
                                    className={styles.presetAction}
                                    onClick={() => setAction({ kind: 'rename', name: preset.name })}
                                >
                                    <Icon>edit</Icon>
                                </IconButton>
                                <IconButton
                                    title={t('effects.removePreset')}
                                    className={styles.presetAction}
                                    onClick={() => setAction({ kind: 'remove', name: preset.name })}
                                >
                                    <Icon>delete</Icon>
                                </IconButton>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div role="radiogroup" aria-label={t('effects.presets')}>
                        {presets?.map((preset, index) => (
                            <label key={index} className={dialogStyles.option}>
                                <span className={dialogStyles.label}>{preset.name}</span>
                                <Radio
                                    name="preset"
                                    value={preset.name}
                                    checked={preset.name === chosen}
                                    onChange={() => choose(preset.name)}
                                />
                            </label>
                        ))}
                    </div>
                )}
                {shownError && <p className={styles.error}>{errorMessage(shownError, t)}</p>}
            </Dialog>
            {action?.kind === 'rename' && (
                <PresetNameDialog
                    title={t('effects.renamePreset')}
                    initialName={action.name}
                    onExisting="refuse"
                    pending={rename.isPending}
                    error={rename.error}
                    onSubmit={newName =>
                        newName === action.name
                            ? setAction(null)
                            : rename.mutate({ name: action.name, newName }, { onSuccess: () => setAction(null) })
                    }
                    onClose={() => setAction(null)}
                />
            )}
            {confirming && (
                <Dialog
                    open
                    compact
                    title={t(confirming.kind === 'replace' ? 'effects.replacePreset' : 'effects.removePreset')}
                    onClose={() => setAction(null)}
                    onSubmit={() => !save.isPending && !remove.isPending && confirm()}
                    actions={
                        <>
                            <TextButton onClick={() => setAction(null)}>{t('actions.cancel')}</TextButton>
                            <TextButton type="submit" disabled={save.isPending || remove.isPending}>
                                {t(confirming.kind === 'replace' ? 'effects.replace' : 'actions.delete')}
                            </TextButton>
                        </>
                    }
                >
                    <p className={styles.question}>
                        {t(
                            confirming.kind === 'replace'
                                ? 'effects.replacePresetConfirm'
                                : 'effects.removePresetConfirm',
                            { name: confirming.name },
                        )}
                    </p>
                    {confirmError && <p className={styles.error}>{errorMessage(confirmError, t)}</p>}
                </Dialog>
            )}
        </>
    );
}

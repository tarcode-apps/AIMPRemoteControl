'use client';

import { useEqualizerPresets } from '@/app/_api/effects';
import { errorMessage } from '@/app/_api/helpers/errors';
import { TextButton } from '@/app/_components/buttons';
import { Dialog } from '@/app/_components/dialogs';
import { TextField } from '@/app/_components/inputs';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Effects.module.scss';

const maxNameLength = 100;

export type PresetNameDialogProps = {
    title: string;
    initialName: string;
    // What a name the library already has does: replace that preset, or nothing,
    // as renaming over another preset is refused.
    onExisting: 'replace' | 'refuse';
    pending: boolean;
    error: unknown;
    onSubmit(name: string): void;
    onClose(): void;
};

// A preset's name, for saving the curve or renaming a preset.
export function PresetNameDialog({
    title,
    initialName,
    onExisting,
    pending,
    error,
    onSubmit,
    onClose,
}: PresetNameDialogProps) {
    const { t } = useTranslation();
    const fieldId = useId();
    const [name, setName] = useState(initialName);
    const { data: presets } = useEqualizerPresets();
    const trimmed = name.trim();
    const exists = presets?.some(preset => preset.name === trimmed) ?? false;
    const refused = onExisting === 'refuse' && exists && trimmed !== initialName;
    const ready = trimmed !== '' && !refused && !pending;

    let hint = ' ';
    if (refused) hint = t('effects.presetNameTaken');
    else if (onExisting === 'replace' && exists) hint = t('effects.presetExists');

    return (
        <Dialog
            open
            compact
            title={title}
            onClose={onClose}
            onSubmit={() => ready && onSubmit(trimmed)}
            actions={
                <>
                    <TextButton onClick={onClose}>{t('actions.cancel')}</TextButton>
                    <TextButton type="submit" disabled={!ready}>
                        {t('actions.ok')}
                    </TextButton>
                </>
            }
        >
            <label htmlFor={fieldId} className={styles.fieldLabel}>
                {t('effects.presetName')}
            </label>
            <TextField
                id={fieldId}
                className={styles.field}
                value={name}
                maxLength={maxNameLength}
                autoFocus
                onFocus={event => event.target.select()}
                onChange={event => setName(event.target.value)}
            />
            <p className={styles.hint}>{hint}</p>
            {error != null && <p className={styles.error}>{errorMessage(error, t)}</p>}
        </Dialog>
    );
}

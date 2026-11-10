'use client';

import { useAddItems } from '@/app/_api/files';
import { errorMessage } from '@/app/_api/helpers/errors';
import type { Playlist } from '@/app/_api/types';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextButton } from '../buttons';
import { Dialog } from '../dialogs';
import { TextField } from '../inputs';
import styles from './PlaylistDialogs.module.scss';

export type AddUrlDialogProps = {
    playlist: Playlist;
    onClose(): void;
};

// The player itself supposes https for a link typed without a scheme.
const schemePattern = /^[a-z][a-z0-9+.-]*:\/\//i;
const withScheme = (text: string) => (schemePattern.test(text) ? text : `https://${text}`);

export function AddUrlDialog({ playlist, onClose }: AddUrlDialogProps) {
    const { t } = useTranslation();
    const fieldId = useId();
    const [text, setText] = useState('');
    const add = useAddItems();
    const trimmed = text.trim();

    const submit = () => {
        if (add.isPending || !trimmed) return;
        add.mutate({ playlistId: playlist.id, urls: [withScheme(trimmed)] }, { onSuccess: onClose });
    };

    return (
        <Dialog
            open
            compact
            title={t('playlist.addUrlTitle')}
            onClose={onClose}
            onSubmit={submit}
            actions={
                <>
                    <TextButton onClick={onClose}>{t('actions.cancel')}</TextButton>
                    <TextButton type="submit" disabled={add.isPending || !trimmed}>
                        {t('actions.ok')}
                    </TextButton>
                </>
            }
        >
            <label htmlFor={fieldId} className={styles.label}>
                {t('playlist.url')}
            </label>
            <TextField
                id={fieldId}
                className={styles.name}
                value={text}
                inputMode="url"
                autoFocus
                onChange={event => setText(event.target.value)}
            />
            {add.error && <p className={styles.error}>{errorMessage(add.error, t)}</p>}
        </Dialog>
    );
}

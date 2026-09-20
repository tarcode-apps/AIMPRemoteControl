'use client';

import { errorMessage } from '@/app/_api/errors';
import { useSortPlaylist } from '@/app/_api/playlists';
import { fieldSorts, sortModes, type Playlist, type SortBy } from '@/app/_api/types';
import clsx from 'clsx';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextButton } from '../buttons';
import { Dialog } from '../dialogs';
import { Checkbox, Radio, TextField } from '../inputs';
import styles from './SortDialog.module.scss';

export type SortDialogProps = {
    playlist: Playlist;
    open: boolean;
    onClose(): void;
};

// Mounted only while open, so every opening starts from the defaults.
export function SortDialog({ open, ...rest }: SortDialogProps) {
    return open ? <OpenSortDialog {...rest} /> : null;
}

function OpenSortDialog({ playlist, onClose }: Omit<SortDialogProps, 'open'>) {
    const { t } = useTranslation();
    const sort = useSortPlaylist(playlist.id);
    const [by, setBy] = useState<SortBy>('title');
    const [template, setTemplate] = useState('');
    const [descending, setDescending] = useState(false);
    const byField = fieldSorts.includes(by);
    const ready = by !== 'template' || template.trim() !== '';

    const submit = () => {
        if (!ready || sort.isPending) return;
        sort.mutate(
            {
                by,
                template: by === 'template' ? template.trim() : undefined,
                descending: byField && descending,
                revision: playlist.revision,
            },
            { onSuccess: onClose },
        );
    };

    return (
        <Dialog
            open
            title={t('playlist.sortBy')}
            onClose={onClose}
            onSubmit={submit}
            footer={
                <label className={clsx(styles.option, !byField && styles.disabled)}>
                    <span className={styles.label}>{t('playlist.descending')}</span>
                    <Checkbox
                        title={t('playlist.descending')}
                        checked={descending}
                        disabled={!byField}
                        onChange={event => setDescending(event.target.checked)}
                    />
                </label>
            }
            actions={
                <>
                    <TextButton onClick={onClose}>{t('actions.cancel')}</TextButton>
                    <TextButton type="submit" disabled={!ready || sort.isPending}>
                        {t('actions.ok')}
                    </TextButton>
                </>
            }
        >
            <div role="radiogroup" aria-label={t('playlist.sortBy')}>
                {sortModes.map(mode => (
                    <div key={mode}>
                        <label className={styles.option}>
                            <span className={styles.label}>{t(`playlist.sortModes.${mode}`)}</span>
                            <Radio name="by" value={mode} checked={by === mode} onChange={() => setBy(mode)} />
                        </label>
                        {mode === 'template' && by === 'template' && (
                            <TextField
                                className={styles.template}
                                value={template}
                                placeholder={t('playlist.sortTemplateExample')}
                                aria-label={t('playlist.sortModes.template')}
                                autoFocus
                                onChange={event => setTemplate(event.target.value)}
                            />
                        )}
                    </div>
                ))}
            </div>
            {sort.error && <p className={styles.error}>{errorMessage(sort.error, t)}</p>}
        </Dialog>
    );
}

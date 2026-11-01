'use client';

import { filesSortModes, type FilesSort } from '@/app/_api/types';
import { TextButton } from '@/app/_components/buttons';
import { Dialog } from '@/app/_components/dialogs';
import dialogStyles from '@/app/_components/dialogs/Dialog.module.scss';
import { Checkbox, Radio } from '@/app/_components/inputs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export type FilesSortDialogProps = {
    sort: FilesSort;
    onClose(): void;
    onSubmit(sort: FilesSort): void;
};

// Starts from the order in use, which stays until changed here.
export function FilesSortDialog({ sort, onClose, onSubmit }: FilesSortDialogProps) {
    const { t } = useTranslation();
    const [by, setBy] = useState(sort.by);
    const [descending, setDescending] = useState(sort.descending);

    return (
        <Dialog
            open
            compact
            title={t('playlist.sortBy')}
            onClose={onClose}
            onSubmit={() => {
                onSubmit({ by, descending });
                onClose();
            }}
            footer={
                <label className={dialogStyles.option}>
                    <span className={dialogStyles.label}>{t('playlist.descending')}</span>
                    <Checkbox
                        title={t('playlist.descending')}
                        checked={descending}
                        onChange={event => setDescending(event.target.checked)}
                    />
                </label>
            }
            actions={
                <>
                    <TextButton onClick={onClose}>{t('actions.cancel')}</TextButton>
                    <TextButton type="submit">{t('actions.ok')}</TextButton>
                </>
            }
        >
            <div role="radiogroup" aria-label={t('playlist.sortBy')}>
                {filesSortModes.map(mode => (
                    <label key={mode} className={dialogStyles.option}>
                        <span className={dialogStyles.label}>{t(`files.sortModes.${mode}`)}</span>
                        <Radio name="by" value={mode} checked={by === mode} onChange={() => setBy(mode)} />
                    </label>
                ))}
            </div>
        </Dialog>
    );
}

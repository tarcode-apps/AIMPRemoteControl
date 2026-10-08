'use client';

import { errorMessage } from '@/app/_api/helpers/errors';
import { fieldSorts, type SortBy } from '@/app/_api/types';
import clsx from 'clsx';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextButton } from '../buttons';
import { Checkbox, Radio, TextField } from '../inputs';
import { Dialog } from './Dialog';
import dialogStyles from './Dialog.module.scss';
import styles from './SortDialog.module.scss';

export type SortChoice<By extends SortBy = SortBy> = {
    by: By;
    template?: string;
    descending: boolean;
};

export type SortDialogProps<By extends SortBy> = {
    open: boolean;
    onClose(): void;
    // The modes offered, in this order.
    modes: readonly By[];
    onSubmit(choice: SortChoice<By>): void;
    pending?: boolean;
    error?: Error | null;
};

// Mounted only while open, so every opening starts from the defaults.
export function SortDialog<By extends SortBy>({ open, ...rest }: SortDialogProps<By>) {
    return open ? <OpenSortDialog {...rest} /> : null;
}

function OpenSortDialog<By extends SortBy>({
    onClose,
    modes,
    onSubmit,
    pending = false,
    error,
}: Omit<SortDialogProps<By>, 'open'>) {
    const { t } = useTranslation();
    const [by, setBy] = useState<By>(modes[0]);
    const [template, setTemplate] = useState('');
    const [descending, setDescending] = useState(false);
    const byField = fieldSorts.includes(by);
    const ready = by !== 'template' || template.trim() !== '';

    const submit = () => {
        if (!ready || pending) return;
        onSubmit({
            by,
            template: by === 'template' ? template.trim() : undefined,
            descending: byField && descending,
        });
    };

    return (
        <Dialog
            open
            title={t('playlist.sortBy')}
            onClose={onClose}
            onSubmit={submit}
            footer={
                <label className={clsx(dialogStyles.option, !byField && dialogStyles.disabled)}>
                    <span className={dialogStyles.label}>{t('playlist.descending')}</span>
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
                    <TextButton type="submit" disabled={!ready || pending}>
                        {t('actions.ok')}
                    </TextButton>
                </>
            }
        >
            <div role="radiogroup" aria-label={t('playlist.sortBy')}>
                {modes.map(mode => (
                    <div key={mode}>
                        <label className={dialogStyles.option}>
                            <span className={dialogStyles.label}>{t(`playlist.sortModes.${mode}`)}</span>
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
            {error && <p className={styles.error}>{errorMessage(error, t)}</p>}
        </Dialog>
    );
}

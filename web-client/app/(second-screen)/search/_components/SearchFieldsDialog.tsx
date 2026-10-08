'use client';

import { normalizeFields } from '@/app/_api/search';
import { searchFields, type SearchField } from '@/app/_api/types';
import { TextButton } from '@/app/_components/buttons';
import { Dialog } from '@/app/_components/dialogs';
import styles from '@/app/_components/dialogs/Dialog.module.scss';
import { Checkbox } from '@/app/_components/inputs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchMode } from './SearchMode';

export type SearchFieldsDialogProps = {
    open: boolean;
    onClose(): void;
};

// Mounted only while open, so every opening starts from the current options.
export function SearchFieldsDialog({ open, onClose }: SearchFieldsDialogProps) {
    return open ? <OpenSearchFieldsDialog onClose={onClose} /> : null;
}

function OpenSearchFieldsDialog({ onClose }: Pick<SearchFieldsDialogProps, 'onClose'>) {
    const { t } = useTranslation();
    const mode = useSearchMode();
    const [fields, setFields] = useState<SearchField[]>(mode.options.fields);
    const ready = fields.length > 0;

    const setField = (field: SearchField, checked: boolean) =>
        setFields(current => (checked ? [...current, field] : current.filter(known => known !== field)));

    const submit = () => {
        if (!ready) return;
        mode.setOptions({ ...mode.options, fields: normalizeFields(fields) });
        onClose();
    };

    return (
        <Dialog
            open
            title={t('search.fields')}
            onClose={onClose}
            onSubmit={submit}
            actions={
                <>
                    <TextButton onClick={onClose}>{t('actions.cancel')}</TextButton>
                    <TextButton type="submit" disabled={!ready}>
                        {t('actions.ok')}
                    </TextButton>
                </>
            }
        >
            {searchFields.map(field => (
                <label key={field} className={styles.option}>
                    <span className={styles.label}>{t(`search.field.${field}`)}</span>
                    <Checkbox
                        title={t(`search.field.${field}`)}
                        checked={fields.includes(field)}
                        onChange={event => setField(field, event.target.checked)}
                    />
                </label>
            ))}
        </Dialog>
    );
}

'use client';

import { TextButton } from '@/app/_components/buttons';
import { Dialog } from '@/app/_components/dialogs';
import styles from '@/app/_components/dialogs/Dialog.module.scss';
import { Radio } from '@/app/_components/inputs';
import { favoritesGroupings, useFavorites, type FavoritesGrouping } from '@/app/_state/Favorites';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export type GroupingDialogProps = {
    open: boolean;
    onClose(): void;
};

// Mounted only while open, so every opening starts from the current grouping.
export function GroupingDialog({ open, onClose }: GroupingDialogProps) {
    return open ? <OpenGroupingDialog onClose={onClose} /> : null;
}

function OpenGroupingDialog({ onClose }: Pick<GroupingDialogProps, 'onClose'>) {
    const { t } = useTranslation();
    const favorites = useFavorites();
    const [grouping, setGrouping] = useState<FavoritesGrouping>(favorites.grouping);

    const submit = () => {
        favorites.setGrouping(grouping);
        onClose();
    };

    return (
        <Dialog
            open
            title={t('favorites.groupBy')}
            onClose={onClose}
            onSubmit={submit}
            actions={
                <>
                    <TextButton onClick={onClose}>{t('actions.cancel')}</TextButton>
                    <TextButton type="submit">{t('actions.ok')}</TextButton>
                </>
            }
        >
            <div role="radiogroup" aria-label={t('favorites.groupBy')}>
                {favoritesGroupings.map(choice => (
                    <label key={choice} className={styles.option}>
                        <span className={styles.label}>{t(`favorites.groupings.${choice}`)}</span>
                        <Radio
                            name="grouping"
                            value={choice}
                            checked={grouping === choice}
                            onChange={() => setGrouping(choice)}
                        />
                    </label>
                ))}
            </div>
        </Dialog>
    );
}

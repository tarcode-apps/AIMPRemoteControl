'use client';

import { usePlaylists } from '@/app/_api/playlists';
import { TextButton } from '@/app/_components/buttons';
import { Dialog } from '@/app/_components/dialogs';
import styles from '@/app/_components/dialogs/Dialog.module.scss';
import { Checkbox } from '@/app/_components/inputs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchMode } from './SearchMode';

export type SearchPlaylistsDialogProps = {
    open: boolean;
    onClose(): void;
};

// Mounted only while open, so every opening starts from the current options.
export function SearchPlaylistsDialog({ open, onClose }: SearchPlaylistsDialogProps) {
    return open ? <OpenSearchPlaylistsDialog onClose={onClose} /> : null;
}

function OpenSearchPlaylistsDialog({ onClose }: Pick<SearchPlaylistsDialogProps, 'onClose'>) {
    const { t } = useTranslation();
    const mode = useSearchMode();
    const { data: playlists } = usePlaylists();
    const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set(mode.options.excluded));
    const includedCount = playlists?.filter(playlist => !excluded.has(playlist.id)).length ?? 0;
    const ready = includedCount > 0;
    const allIncluded = includedCount === (playlists?.length ?? 0);

    const setIncluded = (id: string, included: boolean) =>
        setExcluded(current => {
            const next = new Set(current);
            if (included) next.delete(id);
            else next.add(id);
            return next;
        });
    const setAllIncluded = (included: boolean) =>
        setExcluded(included ? new Set() : new Set(playlists?.map(playlist => playlist.id)));

    const submit = () => {
        if (!ready) return;
        mode.setOptions({ ...mode.options, excluded: [...excluded] });
        onClose();
    };

    return (
        <Dialog
            open
            title={t('search.playlists')}
            onClose={onClose}
            onSubmit={submit}
            footer={
                <label className={styles.option}>
                    <span className={styles.label}>{t('search.allPlaylists')}</span>
                    <Checkbox
                        title={t('search.allPlaylists')}
                        checked={allIncluded}
                        indeterminate={!allIncluded && ready}
                        onChange={event => setAllIncluded(event.target.checked)}
                    />
                </label>
            }
            actions={
                <>
                    <TextButton onClick={onClose}>{t('actions.cancel')}</TextButton>
                    <TextButton type="submit" disabled={!ready}>
                        {t('actions.ok')}
                    </TextButton>
                </>
            }
        >
            {playlists?.map(playlist => (
                <label key={playlist.id} className={styles.option}>
                    <span className={styles.label}>{playlist.name}</span>
                    <Checkbox
                        title={playlist.name}
                        checked={!excluded.has(playlist.id)}
                        onChange={event => setIncluded(playlist.id, event.target.checked)}
                    />
                </label>
            ))}
        </Dialog>
    );
}

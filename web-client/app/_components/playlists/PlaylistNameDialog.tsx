'use client';

import { errorMessage } from '@/app/_api/helpers/errors';
import { useCreatePlaylist, useRenamePlaylist } from '@/app/_api/playlists';
import type { Playlist } from '@/app/_api/types';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextButton } from '../buttons';
import { Dialog } from '../dialogs';
import { TextField } from '../inputs';
import styles from './PlaylistDialogs.module.scss';

export type PlaylistNameDialogProps = {
    // The playlist to rename; a new playlist without one.
    playlist?: Playlist;
    onClose(): void;
    onCreated?(id: string): void;
};

// The name may be submitted empty: the player then names the playlist itself, by
// its content.
export function PlaylistNameDialog({ playlist, onClose, onCreated }: PlaylistNameDialogProps) {
    const { t } = useTranslation();
    const fieldId = useId();
    const [name, setName] = useState(playlist?.name ?? '');
    const create = useCreatePlaylist();
    const rename = useRenamePlaylist();
    const pending = create.isPending || rename.isPending;
    const error = create.error ?? rename.error;
    const trimmed = name.trim();
    const unchanged = playlist !== undefined && trimmed === playlist.name;

    const submit = () => {
        if (pending || unchanged) return;
        if (playlist) rename.mutate({ id: playlist.id, name: trimmed }, { onSuccess: onClose });
        else
            create.mutate(trimmed, {
                onSuccess: ({ id }) => {
                    onClose();
                    onCreated?.(id);
                },
            });
    };

    return (
        <Dialog
            open
            compact
            title={t(playlist ? 'playlists.rename' : 'playlists.create')}
            onClose={onClose}
            onSubmit={submit}
            actions={
                <>
                    <TextButton onClick={onClose}>{t('actions.cancel')}</TextButton>
                    <TextButton type="submit" disabled={pending || unchanged}>
                        {t('actions.ok')}
                    </TextButton>
                </>
            }
        >
            <label htmlFor={fieldId} className={styles.label}>
                {t('playlists.name')}
            </label>
            <TextField
                id={fieldId}
                className={styles.name}
                value={name}
                placeholder={t('playlists.autoName')}
                autoFocus
                onFocus={event => event.target.select()}
                onChange={event => setName(event.target.value)}
            />
            {error && <p className={styles.error}>{errorMessage(error, t)}</p>}
        </Dialog>
    );
}

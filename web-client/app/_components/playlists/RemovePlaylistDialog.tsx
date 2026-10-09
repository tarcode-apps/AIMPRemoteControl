'use client';

import { errorMessage } from '@/app/_api/helpers/errors';
import { useRemovePlaylist } from '@/app/_api/playlists';
import type { Playlist } from '@/app/_api/types';
import { usePlaylistSelection } from '@/app/_state/PlaylistSelection';
import { useTranslation } from 'react-i18next';
import { TextButton } from '../buttons';
import { Dialog } from '../dialogs';
import styles from './PlaylistDialogs.module.scss';

export type RemovePlaylistDialogProps = {
    playlist: Playlist;
    onClose(): void;
};

export function RemovePlaylistDialog({ playlist, onClose }: RemovePlaylistDialogProps) {
    const { t } = useTranslation();
    const remove = useRemovePlaylist();
    const { playlists, selected, select } = usePlaylistSelection();

    const submit = () => {
        if (remove.isPending) return;
        // The selection moves to a neighbour before the list loses the playlist, so
        // that the screen does not fall back to the first playlist meanwhile.
        if (selected?.id === playlist.id && playlists) {
            const index = playlists.indexOf(playlist);
            const neighbour = playlists[index + 1] ?? playlists[index - 1];
            if (neighbour) select(neighbour.id);
        }
        remove.mutate(playlist.id, { onSuccess: onClose });
    };

    return (
        <Dialog
            open
            compact
            title={t('playlists.remove')}
            onClose={onClose}
            onSubmit={submit}
            actions={
                <>
                    <TextButton onClick={onClose}>{t('actions.cancel')}</TextButton>
                    <TextButton type="submit" disabled={remove.isPending}>
                        {t('actions.delete')}
                    </TextButton>
                </>
            }
        >
            <p className={styles.question}>{t('playlists.removeConfirm', { name: playlist.name })}</p>
            {remove.error && <p className={styles.error}>{errorMessage(remove.error, t)}</p>}
        </Dialog>
    );
}

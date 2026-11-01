'use client';

import { ApiError, errorMessage } from '@/app/_api/helpers/errors';
import { usePlaylists, useRemovePlaylistItems } from '@/app/_api/playlists';
import { useSettings } from '@/app/_api/settings';
import type { SelectionInPlaylist } from '@/app/_api/types';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TextButton } from '../buttons';
import { Dialog } from '../dialogs';
import type { MenuItem } from '../menus';
import styles from './PlaylistDialogs.module.scss';

// A track as the lists and the player name it, with the name for the question.
export type RemovableTrack = {
    playlistId: string;
    index: number;
    revision?: number;
    // Neither a stream nor a part of a container file has a file of its own to delete.
    isUrl: boolean;
    inContainer: boolean;
    name: string;
};

// What goes, and what to do once it has gone.
export type SelectionRemoval = {
    parts: SelectionInPlaylist[];
    onRemoved?: (physically: boolean) => void;
};

type Removal = {
    parts: SelectionInPlaylist[];
    physically: boolean;
    name?: string;
    onRemoved?: () => void;
};

export type ItemRemoval = {
    // "Remove from playlist" and, where the settings allow it, "Delete from disk".
    trackItems(track: RemovableTrack, onRemoved?: (physically: boolean) => void): MenuItem[];
    // The same for a selection, which `select` gathers when an item is chosen.
    selectionItems(select: () => SelectionRemoval | undefined, disabled: boolean): MenuItem[];
    // The open dialog, for the caller to render.
    dialogs: ReactNode;
};

// Removing tracks from a playlist or from disk, for a menu the caller puts
// together. Deleting from disk asks first; a removal that fails tells why.
export function useItemRemoval(): ItemRemoval {
    const { t } = useTranslation();
    const remove = useRemovePlaylistItems();
    const { data: playlists } = usePlaylists();
    const canDelete = useSettings().data?.permissions.physicalDeletion === true;
    const [dialog, setDialog] = useState<(Removal & { asking: boolean }) | null>(null);
    const close = () => setDialog(null);

    const run = async (removal: Removal) => {
        try {
            for (const { playlistId, revision, selection } of removal.parts)
                await remove.mutateAsync({ playlistId, revision, physically: removal.physically, ...selection });
        } catch {
            setDialog({ ...removal, asking: false });
            return;
        }
        close();
        removal.onRemoved?.();
    };
    const start = (removal: Removal) => {
        remove.reset();
        if (removal.physically) setDialog({ ...removal, asking: true });
        else void run(removal);
    };

    const items = (removal: (physically: boolean) => Removal | undefined, disabled: boolean, noFile = false) => {
        const chosen = (physically: boolean) => () => {
            if (remove.isPending) return;
            const next = removal(physically);
            if (next) start(next);
        };
        const entries: MenuItem[] = [
            { label: t('playlist.removeFromPlaylist'), icon: 'playlist_remove', disabled, onSelect: chosen(false) },
        ];
        if (canDelete)
            entries.push({
                label: t('playlist.deleteFromDisk'),
                icon: 'delete',
                disabled: disabled || noFile,
                onSelect: chosen(true),
            });
        return entries;
    };

    let dialogs: ReactNode = null;
    if (dialog)
        dialogs = (
            <Dialog
                open
                compact
                title={t(dialog.physically ? 'playlist.deleteFromDisk' : 'playlist.removeFromPlaylist')}
                onClose={close}
                onSubmit={dialog.asking ? () => void run(dialog) : close}
                actions={
                    dialog.asking ? (
                        <>
                            <TextButton onClick={close}>{t('actions.cancel')}</TextButton>
                            <TextButton type="submit" disabled={remove.isPending}>
                                {t('actions.delete')}
                            </TextButton>
                        </>
                    ) : (
                        <TextButton type="submit">{t('actions.ok')}</TextButton>
                    )
                }
            >
                {dialog.asking && (
                    <p className={styles.question}>
                        {dialog.name
                            ? t('playlist.deleteFromDiskConfirm', { name: dialog.name })
                            : t('playlist.deleteSelectedFromDiskConfirm')}
                    </p>
                )}
                {remove.error && <p className={styles.error}>{errorMessage(remove.error, t)}</p>}
                {remove.error instanceof ApiError && remove.error.files.length > 0 && (
                    <ul className={styles.files}>
                        {remove.error.files.map(file => (
                            <li key={file}>{file}</li>
                        ))}
                    </ul>
                )}
            </Dialog>
        );

    return {
        trackItems: (track, onRemoved) =>
            items(
                physically => ({
                    parts: [
                        {
                            playlistId: track.playlistId,
                            revision: track.revision,
                            selection: { indexes: [track.index] },
                        },
                    ],
                    physically,
                    name: track.name,
                    onRemoved: onRemoved && (() => onRemoved(physically)),
                }),
                playlists?.find(playlist => playlist.id === track.playlistId)?.readOnly === true,
                track.isUrl || track.inContainer,
            ),
        selectionItems: (select, disabled) =>
            items(physically => {
                const selected = select();
                return (
                    selected && {
                        parts: selected.parts,
                        physically,
                        onRemoved: selected.onRemoved && (() => selected.onRemoved?.(physically)),
                    }
                );
            }, disabled),
        dialogs,
    };
}

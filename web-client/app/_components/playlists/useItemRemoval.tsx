'use client';

import { ApiError, errorMessage } from '@/app/_api/helpers/errors';
import { selectionOfTracks, useRemoveItems } from '@/app/_api/items';
import { usePlaylists } from '@/app/_api/playlists';
import { useSettings } from '@/app/_api/settings';
import type { ItemsSelection } from '@/app/_api/types';
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

type OnRemoved = (physically: boolean) => void;

type Removal = {
    selection: ItemsSelection;
    name?: string;
    onRemoved?: OnRemoved;
};

export type ItemRemoval = {
    // "Remove from playlist" and, where the settings allow it, "Delete from disk";
    // disabled while the track's playlist is read-only.
    trackItems(track: RemovableTrack, onRemoved?: OnRemoved): MenuItem[];
    // The same for a selection, which `select` gathers: disabled while it names
    // nothing or a read-only playlist.
    selectionItems(select: () => ItemsSelection | undefined, onRemoved?: OnRemoved): MenuItem[];
    // The Delete key: out of the playlist at once, on the terms of the menu items.
    removeTrack(track: RemovableTrack, onRemoved?: OnRemoved): void;
    removeSelection(selection: ItemsSelection | undefined, onRemoved?: OnRemoved): void;
    // The open dialog, for the caller to render.
    dialogs: ReactNode;
};

// Removing tracks from a playlist or from disk, for a menu the caller puts
// together. Deleting from disk asks first; a removal that fails tells why.
export function useItemRemoval(): ItemRemoval {
    const { t } = useTranslation();
    const remove = useRemoveItems();
    const { data: playlists } = usePlaylists();
    const canDelete = useSettings().data?.permissions.physicalDeletion === true;
    const [dialog, setDialog] = useState<(Removal & { physically: boolean; asking: boolean }) | null>(null);
    const close = () => setDialog(null);

    const run = async (removal: Removal, physically: boolean) => {
        try {
            await remove.mutateAsync({ ...removal.selection, physically });
        } catch {
            setDialog({ ...removal, physically, asking: false });
            return;
        }
        close();
        removal.onRemoved?.(physically);
    };
    const start = (removal: Removal | undefined, physically: boolean) => {
        if (!removal || remove.isPending) return;
        remove.reset();
        if (physically) setDialog({ ...removal, physically, asking: true });
        else void run(removal, physically);
    };

    const readOnly = (playlistId: string) => playlists?.find(playlist => playlist.id === playlistId)?.readOnly === true;
    const ofTrack = (track: RemovableTrack, onRemoved?: OnRemoved): Removal | undefined =>
        readOnly(track.playlistId) ? undefined : { selection: selectionOfTracks([track]), name: track.name, onRemoved };
    const ofSelection = (selection: ItemsSelection | undefined, onRemoved?: OnRemoved): Removal | undefined =>
        selection?.playlists.length && !selection.playlists.some(({ playlistId }) => readOnly(playlistId))
            ? { selection, onRemoved }
            : undefined;

    const items = (removal: Removal | undefined, noFile = false) => {
        const disabled = removal === undefined;
        const entries: MenuItem[] = [
            {
                label: t('playlist.removeFromPlaylist'),
                icon: 'playlist_remove',
                disabled,
                onSelect: () => start(removal, false),
            },
        ];
        if (canDelete)
            entries.push({
                label: t('playlist.deleteFromDisk'),
                icon: 'delete',
                disabled: disabled || noFile,
                onSelect: () => start(removal, true),
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
                onSubmit={dialog.asking ? () => void run(dialog, dialog.physically) : close}
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
        trackItems: (track, onRemoved) => items(ofTrack(track, onRemoved), track.isUrl || track.inContainer),
        selectionItems: (select, onRemoved) => items(ofSelection(select(), onRemoved)),
        removeTrack: (track, onRemoved) => start(ofTrack(track, onRemoved), false),
        removeSelection: (selection, onRemoved) => start(ofSelection(selection, onRemoved), false),
        dialogs,
    };
}

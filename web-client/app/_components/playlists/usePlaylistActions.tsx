'use client';

import type { Playlist } from '@/app/_api/types';
import { useNavigation } from '@/app/_state/Navigation';
import { usePlaylistSelection } from '@/app/_state/PlaylistSelection';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MenuItem } from '../menus';
import { useDrawer } from '../sidenav/Drawer';
import { PlaylistNameDialog } from './PlaylistNameDialog';
import { RemovePlaylistDialog } from './RemovePlaylistDialog';

type PlaylistDialog = { kind: 'create' } | { kind: 'rename' | 'remove'; playlist: Playlist };

export type PlaylistActions = {
    // Opens the dialog of a new playlist, which is shown once created.
    create(): void;
    createItem(): MenuItem;
    renameItem(playlist: Playlist): MenuItem;
    removeItem(playlist: Playlist): MenuItem;
    // The open dialog, for the caller to render.
    dialogs: ReactNode;
};

// The actions on a playlist as a whole, for a menu the caller puts together.
export function usePlaylistActions(onCreated?: () => void): PlaylistActions {
    const { t } = useTranslation();
    const { closeThen } = useDrawer();
    const { select } = usePlaylistSelection();
    const { openScreen } = useNavigation();
    const [dialog, setDialog] = useState<PlaylistDialog | null>(null);
    const close = () => setDialog(null);
    const create = () => setDialog({ kind: 'create' });

    const created = (id: string) => {
        onCreated?.();
        closeThen(() => {
            select(id);
            openScreen('/');
        });
    };

    let dialogs: ReactNode = null;
    if (dialog?.kind === 'remove') dialogs = <RemovePlaylistDialog playlist={dialog.playlist} onClose={close} />;
    else if (dialog)
        dialogs = (
            <PlaylistNameDialog
                playlist={dialog.kind === 'rename' ? dialog.playlist : undefined}
                onClose={close}
                onCreated={created}
            />
        );

    return {
        create,
        createItem: () => ({ label: t('playlists.create'), icon: 'playlist_add', onSelect: create }),
        renameItem: playlist => ({
            label: t('playlists.rename'),
            icon: 'edit',
            onSelect: () => setDialog({ kind: 'rename', playlist }),
        }),
        removeItem: playlist => ({
            label: t('playlists.remove'),
            icon: 'delete',
            onSelect: () => setDialog({ kind: 'remove', playlist }),
        }),
        dialogs,
    };
}

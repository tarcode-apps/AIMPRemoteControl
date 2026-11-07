'use client';

import { useEnqueueSelections } from '@/app/_api/queue';
import { ToolbarButton } from '@/app/_components/buttons';
import { Icon } from '@/app/_components/icons';
import { ListToolbar } from '@/app/_components/lists';
import { useItemRemoval } from '@/app/_components/playlists';
import { useErrorToast } from '@/app/_components/toast';
import { useFavoriteRelink } from '@/app/_state/Favorites';
import { useFavoriteActions } from '@/app/_state/useFavoriteActions';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchFieldsDialog } from './SearchFieldsDialog';
import { useSearchMode } from './SearchMode';
import { SearchPlaylistsDialog } from './SearchPlaylistsDialog';

export function SearchToolbar() {
    const { t } = useTranslation();
    const showError = useErrorToast();
    const mode = useSearchMode();
    const enqueueSelections = useEnqueueSelections();
    const favoriteActions = useFavoriteActions();
    const removal = useItemRemoval();
    const { relinking } = useFavoriteRelink();
    const [dialog, setDialog] = useState<'playlists' | 'fields' | null>(null);
    const closeDialog = () => setDialog(null);
    const enqueueSelected = (atBeginning: boolean) => enqueueSelections(mode.selectionByPlaylist() ?? [], atBeginning);

    return (
        <>
            <ListToolbar
                mode={mode}
                searchPlaceholder={t('search.placeholder')}
                externalSearch={{ value: mode.typed, onChange: mode.setTyped }}
                idle={
                    <>
                        <ToolbarButton title={t('search.playlists')} onClick={() => setDialog('playlists')}>
                            <Icon>queue_music</Icon>
                        </ToolbarButton>
                        <ToolbarButton
                            title={t('playlist.select')}
                            disabled={mode.rows.count === 0 || relinking !== null}
                            onClick={() => mode.setMode('select')}
                        >
                            <Icon>checklist</Icon>
                        </ToolbarButton>
                        <span />
                    </>
                }
                moreActions={[{ label: t('search.fields'), icon: 'tune', onSelect: () => setDialog('fields') }]}
                selectedActions={[
                    {
                        label: t('playlist.enqueue'),
                        icon: 'playlist_add',
                        disabled: mode.nothingSelected,
                        onSelect: () => void enqueueSelected(false).catch(showError),
                    },
                    {
                        label: t('playlist.enqueueFirst'),
                        icon: 'playlist_play',
                        disabled: mode.nothingSelected,
                        onSelect: () => void enqueueSelected(true).catch(showError),
                    },
                    {
                        label: t('favorites.add'),
                        icon: 'heart_plus',
                        disabled: mode.nothingSelected,
                        onSelect: () =>
                            void favoriteActions.addSelections(mode.selectionByPlaylist() ?? []).catch(showError),
                    },
                    ...removal.selectionItems(() => {
                        const parts = mode.selectionByPlaylist();
                        return parts && { parts };
                    }, mode.nothingSelected),
                ]}
            />
            {removal.dialogs}
            <SearchPlaylistsDialog open={dialog === 'playlists'} onClose={closeDialog} />
            <SearchFieldsDialog open={dialog === 'fields'} onClose={closeDialog} />
        </>
    );
}

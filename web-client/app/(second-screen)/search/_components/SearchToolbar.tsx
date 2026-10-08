'use client';

import { useEnqueueSelections } from '@/app/_api/queue';
import { ToolbarButton } from '@/app/_components/buttons';
import { Icon } from '@/app/_components/icons';
import { ListToolbar } from '@/app/_components/lists';
import { useFavoriteRelink } from '@/app/_state/Favorites';
import { useFavoriteActions } from '@/app/_state/useFavoriteActions';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchFieldsDialog } from './SearchFieldsDialog';
import { useSearchMode } from './SearchMode';
import { SearchPlaylistsDialog } from './SearchPlaylistsDialog';

export function SearchToolbar() {
    const { t } = useTranslation();
    const mode = useSearchMode();
    const enqueueSelections = useEnqueueSelections();
    const favoriteActions = useFavoriteActions();
    const { relinking } = useFavoriteRelink();
    const [dialog, setDialog] = useState<'playlists' | 'fields' | null>(null);
    const closeDialog = () => setDialog(null);
    const grouped = (mode.result?.playlists.length ?? 0) > 0;
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
                        <ToolbarButton title={t('search.fields')} onClick={() => setDialog('fields')}>
                            <Icon>tune</Icon>
                        </ToolbarButton>
                    </>
                }
                moreActions={[
                    {
                        label: t('playlist.collapseAll'),
                        icon: 'unfold_less',
                        disabled: !grouped,
                        onSelect: () => mode.setAllExpanded(false),
                    },
                    {
                        label: t('playlist.expandAll'),
                        icon: 'unfold_more',
                        disabled: !grouped,
                        onSelect: () => mode.setAllExpanded(true),
                    },
                ]}
                selectedActions={[
                    {
                        label: t('playlist.enqueue'),
                        icon: 'playlist_add',
                        disabled: mode.nothingSelected,
                        onSelect: () => void enqueueSelected(false),
                    },
                    {
                        label: t('playlist.enqueueFirst'),
                        icon: 'playlist_play',
                        disabled: mode.nothingSelected,
                        onSelect: () => void enqueueSelected(true),
                    },
                    {
                        label: t('favorites.add'),
                        icon: 'heart_plus',
                        disabled: mode.nothingSelected,
                        onSelect: () => void favoriteActions.addSelections(mode.selectionByPlaylist() ?? []),
                    },
                ]}
            />
            <SearchPlaylistsDialog open={dialog === 'playlists'} onClose={closeDialog} />
            <SearchFieldsDialog open={dialog === 'fields'} onClose={closeDialog} />
        </>
    );
}

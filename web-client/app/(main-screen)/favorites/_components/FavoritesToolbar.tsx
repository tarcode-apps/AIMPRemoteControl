'use client';

import { groupByPlaylist } from '@/app/_api/playlists';
import { useEnqueueSelections } from '@/app/_api/queue';
import { ToolbarButton } from '@/app/_components/buttons';
import { SortDialog } from '@/app/_components/dialogs';
import { Icon } from '@/app/_components/icons';
import { ListToolbar } from '@/app/_components/lists';
import toolbarStyles from '@/app/_components/lists/ListToolbar.module.scss';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { favoritesSortModes, useFavorites } from '@/app/_state/Favorites';
import { media } from '@/app/_styles/media';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFavoritesMode } from './FavoritesMode';
import { GroupingDialog } from './GroupingDialog';

export function FavoritesToolbar() {
    const { t } = useTranslation();
    const docked = useMediaQuery(media.drawerDocked);
    const mode = useFavoritesMode();
    const favorites = useFavorites();
    const enqueueSelections = useEnqueueSelections();
    const [dialog, setDialog] = useState<'grouping' | 'sort' | null>(null);
    const closeDialog = () => setDialog(null);
    const empty = mode.entries.length === 0;

    const enqueueSelected = (atBeginning: boolean) => {
        const tracks = mode.selectedEntries().flatMap(({ located }) => (located ? [located] : []));
        const parts = [...groupByPlaylist(tracks)].map(([playlistId, located]) => ({
            playlistId,
            revision: located[0].revision,
            selection: { indexes: located.map(track => track.index) },
        }));
        return enqueueSelections(parts, atBeginning);
    };

    const removeSelected = () => {
        favorites.remove(mode.selectedEntries().map(({ record }) => record.fileUri));
        if (mode.mode === 'select') mode.setMode(null);
    };

    return (
        <>
            <ListToolbar
                mode={mode}
                searchPlaceholder={t('favorites.searchPlaceholder')}
                idle={
                    <>
                        <span />
                        <ToolbarButton
                            title={t('playlist.select')}
                            disabled={empty}
                            onClick={() => mode.setMode('select')}
                        >
                            <Icon>checklist</Icon>
                        </ToolbarButton>
                        <ToolbarButton title={t('playlist.sort')} disabled={empty} onClick={() => mode.setMode('sort')}>
                            <Icon>sort</Icon>
                        </ToolbarButton>
                    </>
                }
                moreActions={[
                    { label: t('favorites.groupBy'), icon: 'view_list', onSelect: () => setDialog('grouping') },
                    {
                        label: t('playlist.collapseAll'),
                        icon: 'unfold_less',
                        disabled: empty,
                        onSelect: () => mode.setAllExpanded(false),
                    },
                    {
                        label: t('playlist.expandAll'),
                        icon: 'unfold_more',
                        disabled: empty,
                        onSelect: () => mode.setAllExpanded(true),
                    },
                    {
                        label: t('favorites.clear'),
                        icon: 'delete_sweep',
                        disabled: favorites.records.length === 0,
                        onSelect: () => favorites.clear(),
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
                        label: t('favorites.remove'),
                        icon: 'heart_minus',
                        disabled: mode.nothingSelected,
                        onSelect: removeSelected,
                    },
                ]}
                sorting={
                    <>
                        <span />
                        <span />
                        <ToolbarButton
                            title={t('playlist.closeSort')}
                            className={toolbarStyles.active}
                            onClick={() => mode.setMode(null)}
                        >
                            <Icon>sort</Icon>
                        </ToolbarButton>
                        {!docked && <span />}
                        <ToolbarButton title={t('playlist.sortBy')} onClick={() => setDialog('sort')}>
                            <Icon>sort_by_alpha</Icon>
                        </ToolbarButton>
                    </>
                }
            />
            <GroupingDialog open={dialog === 'grouping'} onClose={closeDialog} />
            <SortDialog
                open={dialog === 'sort'}
                onClose={closeDialog}
                modes={favoritesSortModes}
                onSubmit={({ by, descending }) => {
                    favorites.sort(by, descending);
                    closeDialog();
                }}
            />
        </>
    );
}

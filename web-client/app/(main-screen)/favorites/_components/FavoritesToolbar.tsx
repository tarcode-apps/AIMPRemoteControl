'use client';

import { useEnqueueSelections } from '@/app/_api/queue';
import { ToolbarButton } from '@/app/_components/buttons';
import { SortDialog } from '@/app/_components/dialogs';
import { Icon } from '@/app/_components/icons';
import { ListToolbar } from '@/app/_components/lists';
import toolbarStyles from '@/app/_components/lists/ListToolbar.module.scss';
import { useItemRemoval } from '@/app/_components/playlists';
import { useErrorToast } from '@/app/_components/toast';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { favoritesSortModes, useFavorites } from '@/app/_state/Favorites';
import { media } from '@/app/_styles/media';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { removalOf, selectionByPlaylist, useFavoritesMode } from './FavoritesMode';
import { GroupingDialog } from './GroupingDialog';

export function FavoritesToolbar() {
    const { t } = useTranslation();
    const showError = useErrorToast();
    const docked = useMediaQuery(media.drawerDocked);
    const mode = useFavoritesMode();
    const favorites = useFavorites();
    const enqueueSelections = useEnqueueSelections();
    const removal = useItemRemoval();
    const [dialog, setDialog] = useState<'grouping' | 'sort' | null>(null);
    const closeDialog = () => setDialog(null);
    const empty = mode.entries.length === 0;

    const enqueueSelected = (atBeginning: boolean) =>
        enqueueSelections(selectionByPlaylist(mode.selectedEntries()), atBeginning);

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
                        onSelect: () => void enqueueSelected(false).catch(showError),
                    },
                    {
                        label: t('playlist.enqueueFirst'),
                        icon: 'playlist_play',
                        disabled: mode.nothingSelected,
                        onSelect: () => void enqueueSelected(true).catch(showError),
                    },
                    {
                        label: t('favorites.remove'),
                        icon: 'heart_minus',
                        disabled: mode.nothingSelected,
                        onSelect: removeSelected,
                    },
                    ...removal.selectionItems(
                        () => removalOf(mode.selectedEntries(), favorites.remove),
                        mode.nothingSelected,
                    ),
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
            {removal.dialogs}
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

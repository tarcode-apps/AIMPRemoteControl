'use client';

import { useSetGroupExpanded } from '@/app/_api/playlists';
import { useEnqueue } from '@/app/_api/queue';
import { ToolbarButton } from '@/app/_components/buttons';
import { Icon } from '@/app/_components/icons';
import { ListToolbar } from '@/app/_components/lists';
import toolbarStyles from '@/app/_components/lists/ListToolbar.module.scss';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { useNavigation } from '@/app/_state/Navigation';
import { usePlaylistSelection } from '@/app/_state/PlaylistSelection';
import { useFavoriteActions } from '@/app/_state/useFavoriteActions';
import { media } from '@/app/_styles/media';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaylistMode } from './PlaylistMode';
import { PlaylistSortDialog } from './SortDialog';

export function PlaylistToolbar() {
    const { t } = useTranslation();
    const { openSecondScreen } = useNavigation();
    const docked = useMediaQuery(media.drawerDocked);
    const { selected } = usePlaylistSelection();
    const mode = usePlaylistMode();
    const setExpanded = useSetGroupExpanded(selected?.id ?? '');
    const enqueue = useEnqueue();
    const favoriteActions = useFavoriteActions();
    const [sortDialog, setSortDialog] = useState(false);
    const grouped = selected?.grouping.enabled ?? false;
    const expandAll = (expanded: boolean) => {
        if (selected) setExpanded.mutate({ expanded, revision: selected.revision });
    };
    const enqueueSelected = (atBeginning: boolean) => {
        const selection = mode.itemSelection();
        if (selected && selection)
            enqueue.mutate({ playlistId: selected.id, revision: selected.revision, atBeginning, ...selection });
    };
    const addSelectedToFavorites = () => {
        const selection = mode.itemSelection();
        if (selected && selection)
            void favoriteActions.addSelections([{ playlistId: selected.id, revision: selected.revision, selection }]);
    };
    // The extended search takes the text a search here was typed with; coming back
    // finds the plain playlist.
    const extendedSearch = {
        label: t('search.title'),
        icon: 'manage_search',
        onSelect: () => {
            const url = mode.text ? `/search/?q=${encodeURIComponent(mode.text)}` : '/search/';
            mode.leaveThen(() => openSecondScreen(url));
        },
    };

    return (
        <ListToolbar
            mode={mode}
            searchPlaceholder={t('playlist.searchPlaceholder')}
            idle={
                <>
                    <ToolbarButton title={t('playlist.add')} disabled>
                        <Icon>add</Icon>
                    </ToolbarButton>
                    <ToolbarButton title={t('playlist.select')} onClick={() => mode.setMode('select')}>
                        <Icon>checklist</Icon>
                    </ToolbarButton>
                    <ToolbarButton title={t('playlist.sort')} disabled={!selected} onClick={() => mode.setMode('sort')}>
                        <Icon>sort</Icon>
                    </ToolbarButton>
                </>
            }
            moreActions={[
                {
                    label: t('playlist.collapseAll'),
                    icon: 'unfold_less',
                    disabled: !grouped,
                    onSelect: () => expandAll(false),
                },
                {
                    label: t('playlist.expandAll'),
                    icon: 'unfold_more',
                    disabled: !grouped,
                    onSelect: () => expandAll(true),
                },
                extendedSearch,
            ]}
            selectedActions={[
                {
                    label: t('playlist.enqueue'),
                    icon: 'playlist_add',
                    disabled: mode.nothingSelected,
                    onSelect: () => enqueueSelected(false),
                },
                {
                    label: t('playlist.enqueueFirst'),
                    icon: 'playlist_play',
                    disabled: mode.nothingSelected,
                    onSelect: () => enqueueSelected(true),
                },
                {
                    label: t('favorites.add'),
                    icon: 'heart_plus',
                    disabled: mode.nothingSelected,
                    onSelect: addSelectedToFavorites,
                },
                { label: t('playlist.removeSelected'), icon: 'delete', disabled: true, onSelect: () => {} },
                ...(mode.mode === 'search' ? [extendedSearch] : []),
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
                    <ToolbarButton
                        title={t('playlist.sortBy')}
                        disabled={!selected || selected.readOnly}
                        onClick={() => setSortDialog(true)}
                    >
                        <Icon>sort_by_alpha</Icon>
                    </ToolbarButton>
                    {selected && (
                        <PlaylistSortDialog
                            playlist={selected}
                            open={sortDialog}
                            onClose={() => setSortDialog(false)}
                        />
                    )}
                </>
            }
        />
    );
}

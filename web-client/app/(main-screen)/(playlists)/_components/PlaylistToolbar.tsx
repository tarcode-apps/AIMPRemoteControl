'use client';

import { useFormats } from '@/app/_api/files';
import { usePlayer } from '@/app/_api/player';
import { useSetGroupExpanded } from '@/app/_api/playlists';
import { useEnqueue } from '@/app/_api/queue';
import { useSettings } from '@/app/_api/settings';
import type { FileType } from '@/app/_api/types';
import { ToolbarButton } from '@/app/_components/buttons';
import { Icon } from '@/app/_components/icons';
import { ListToolbar } from '@/app/_components/lists';
import toolbarStyles from '@/app/_components/lists/ListToolbar.module.scss';
import { Menu, menuSeparator, type MenuEntry } from '@/app/_components/menus';
import { AddUrlDialog, usePlaylistActions } from '@/app/_components/playlists';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { useNavigation } from '@/app/_state/Navigation';
import { usePlaylistSelection } from '@/app/_state/PlaylistSelection';
import { useUploads } from '@/app/_state/Uploads';
import { useFavoriteActions } from '@/app/_state/useFavoriteActions';
import { media } from '@/app/_styles/media';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaylistMode } from './PlaylistMode';
import { PlaylistSortDialog } from './SortDialog';

// The address of the file browser, adding to `playlistId` what it picks.
export function filesScreenHref(playlistId: string, type: FileType) {
    return `/files/?to=${encodeURIComponent(playlistId)}&types=${type}`;
}

export function PlaylistToolbar() {
    const { t } = useTranslation();
    const { openSecondScreen } = useNavigation();
    const docked = useMediaQuery(media.drawerDocked);
    const { selected, showTrack } = usePlaylistSelection();
    const playing = usePlayer().data?.track;
    const mode = usePlaylistMode();
    const setExpanded = useSetGroupExpanded(selected?.id ?? '');
    const enqueue = useEnqueue();
    const favoriteActions = useFavoriteActions();
    const playlistActions = usePlaylistActions();
    const uploads = useUploads();
    const permissions = useSettings().data?.permissions;
    const { data: formats } = useFormats();
    const fileInput = useRef<HTMLInputElement>(null);
    const [sortDialog, setSortDialog] = useState(false);
    const [urlDialog, setUrlDialog] = useState(false);
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

    const playlistEntries: MenuEntry[] = selected
        ? [menuSeparator, playlistActions.renameItem(selected), playlistActions.removeItem(selected)]
        : [];

    // What the player's settings allow; a URL needs no permission.
    const pickFiles = () => fileInput.current?.click();
    const canBrowse = selected !== undefined && permissions?.browseFiles === true;
    const canUpload = permissions?.uploadTracks === true;
    const browseEntries: MenuEntry[] =
        canBrowse && selected
            ? [
                  {
                      label: t('playlist.addFiles'),
                      icon: 'audio_file',
                      onSelect: () => mode.leaveThen(() => openSecondScreen(filesScreenHref(selected.id, 'audio'))),
                  },
                  {
                      label: t('playlist.addPlaylistFile'),
                      icon: 'queue_music',
                      onSelect: () => mode.leaveThen(() => openSecondScreen(filesScreenHref(selected.id, 'playlist'))),
                  },
              ]
            : [];
    const uploadEntries: MenuEntry[] = canUpload
        ? [{ label: t('playlist.upload'), icon: 'upload', disabled: uploads.progress !== null, onSelect: pickFiles }]
        : [];
    const separator: MenuEntry[] = canBrowse || canUpload ? [menuSeparator] : [];
    const addEntries: MenuEntry[] = [
        ...browseEntries,
        ...uploadEntries,
        ...separator,
        { label: t('playlist.addUrl'), icon: 'link', onSelect: () => setUrlDialog(true) },
    ];

    return (
        <>
            <ListToolbar
                mode={mode}
                searchPlaceholder={t('playlist.searchPlaceholder')}
                idle={
                    <>
                        <Menu
                            title={t('playlist.add')}
                            icon="add"
                            Button={ToolbarButton}
                            disabled={!selected || selected.readOnly}
                            items={addEntries}
                        />
                        <ToolbarButton title={t('playlist.select')} onClick={() => mode.setMode('select')}>
                            <Icon>checklist</Icon>
                        </ToolbarButton>
                        <ToolbarButton
                            title={t('playlist.sort')}
                            disabled={!selected}
                            onClick={() => mode.setMode('sort')}
                        >
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
                    {
                        label: t('playlist.goToPlaying'),
                        icon: 'my_location',
                        disabled: !playing,
                        onSelect: () => {
                            if (playing) showTrack({ playlistId: playing.playlistId, index: playing.index });
                        },
                    },
                    extendedSearch,
                    ...playlistEntries,
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
            {playlistActions.dialogs}
            {urlDialog && selected && <AddUrlDialog playlist={selected} onClose={() => setUrlDialog(false)} />}
            <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                accept={formats?.audio.map(extension => `.${extension}`).join(',')}
                onChange={event => {
                    if (selected) uploads.start(selected.id, [...event.target.files!]);
                    // The same files may be picked again.
                    event.target.value = '';
                }}
            />
        </>
    );
}

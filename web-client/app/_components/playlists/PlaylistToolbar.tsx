'use client';

import { useSetGroupExpanded } from '@/app/_api/playlists';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { media } from '@/app/_styles/media';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../buttons';
import { Icon } from '../icons';
import { SearchField } from '../inputs';
import { Menu } from '../menus';
import { usePlaylistSearch } from './PlaylistSearch';
import { usePlaylistSelection } from './PlaylistSelection';
import styles from './PlaylistToolbar.module.scss';

export function PlaylistToolbar() {
    const { t } = useTranslation();
    const docked = useMediaQuery(media.drawerDocked);
    const { selected } = usePlaylistSelection();
    const search = usePlaylistSearch();
    const setExpanded = useSetGroupExpanded(selected?.id ?? '');
    const grouped = selected?.grouping.enabled ?? false;
    const expandAll = (expanded: boolean) => {
        if (selected) setExpanded.mutate({ expanded, revision: selected.revision });
    };
    const allSelected = search.selection.all && search.selection.toggled.size === 0;

    return (
        <div className={styles.toolbar}>
            {docked && (
                <SearchField
                    className={styles.search}
                    value={search.query ?? ''}
                    onChange={value => search.setQuery(value === '' ? null : value)}
                />
            )}
            {search.active ? (
                <>
                    <IconButton
                        title={t(allSelected ? 'playlist.deselectAll' : 'playlist.selectAll')}
                        onClick={search.toggleAll}
                    >
                        <Icon>{allSelected ? 'deselect' : 'select_all'}</Icon>
                    </IconButton>
                    {/* The closing button sits in the slot of the button that opened the mode. */}
                    {search.selecting ? (
                        <IconButton
                            title={t('playlist.closeSelection')}
                            className={styles.active}
                            onClick={() => search.setSelecting(false)}
                        >
                            <Icon>checklist</Icon>
                        </IconButton>
                    ) : (
                        <span />
                    )}
                    <span />
                    {!docked &&
                        (search.selecting ? (
                            <span />
                        ) : (
                            <IconButton
                                title={t('playlist.closeSearch')}
                                className={styles.active}
                                onClick={() => search.setQuery(null)}
                            >
                                <Icon>search</Icon>
                            </IconButton>
                        ))}
                    <Menu
                        title={t('playlist.selectedActions')}
                        icon="more_horiz"
                        items={[
                            {
                                label: t('playlist.enqueueSelected'),
                                icon: 'playlist_add',
                                disabled: true,
                                onSelect: () => {},
                            },
                            { label: t('playlist.removeSelected'), icon: 'delete', disabled: true, onSelect: () => {} },
                        ]}
                    />
                </>
            ) : (
                <>
                    <IconButton title={t('playlist.add')} disabled>
                        <Icon>add</Icon>
                    </IconButton>
                    <IconButton title={t('playlist.select')} onClick={() => search.setSelecting(true)}>
                        <Icon>checklist</Icon>
                    </IconButton>
                    <IconButton title={t('playlist.sort')} disabled>
                        <Icon>sort</Icon>
                    </IconButton>
                    {!docked && (
                        <IconButton
                            title={t('playlist.search')}
                            className={clsx(search.query !== null && styles.active)}
                            onClick={() => search.setQuery(search.query === null ? '' : null)}
                        >
                            <Icon>search</Icon>
                        </IconButton>
                    )}
                    <Menu
                        title={t('playlist.more')}
                        icon="more_horiz"
                        items={[
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
                        ]}
                    />
                </>
            )}
        </div>
    );
}

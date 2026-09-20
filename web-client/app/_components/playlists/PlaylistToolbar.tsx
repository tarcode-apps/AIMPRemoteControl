'use client';

import { useSetGroupExpanded } from '@/app/_api/playlists';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { media } from '@/app/_styles/media';
import clsx from 'clsx';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolbarButton } from '../buttons';
import { Icon } from '../icons';
import { SearchField } from '../inputs';
import { Menu } from '../menus';
import { usePlaylistMode } from './PlaylistMode';
import { usePlaylistSelection } from './PlaylistSelection';
import styles from './PlaylistToolbar.module.scss';
import { SortDialog } from './SortDialog';

export function PlaylistToolbar() {
    const { t } = useTranslation();
    const docked = useMediaQuery(media.drawerDocked);
    const { selected } = usePlaylistSelection();
    const mode = usePlaylistMode();
    const setExpanded = useSetGroupExpanded(selected?.id ?? '');
    const [sortDialog, setSortDialog] = useState(false);
    const grouped = selected?.grouping.enabled ?? false;
    const expandAll = (expanded: boolean) => {
        if (selected) setExpanded.mutate({ expanded, revision: selected.revision });
    };
    const allSelected = mode.selection.all && mode.selection.toggled.size === 0;

    // A button that closes a mode sits in the slot of the button that opened it.
    let buttons;
    if (mode.mode === 'sort')
        buttons = (
            <>
                <span />
                <span />
                <ToolbarButton
                    title={t('playlist.closeSort')}
                    className={styles.active}
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
                {selected && <SortDialog playlist={selected} open={sortDialog} onClose={() => setSortDialog(false)} />}
            </>
        );
    else if (mode.selecting)
        buttons = (
            <>
                <ToolbarButton
                    title={t(allSelected ? 'playlist.deselectAll' : 'playlist.selectAll')}
                    onClick={mode.toggleAll}
                >
                    <Icon>{allSelected ? 'deselect' : 'select_all'}</Icon>
                </ToolbarButton>
                {mode.mode === 'select' ? (
                    <ToolbarButton
                        title={t('playlist.closeSelection')}
                        className={styles.active}
                        onClick={() => mode.setMode(null)}
                    >
                        <Icon>checklist</Icon>
                    </ToolbarButton>
                ) : (
                    <span />
                )}
                <span />
                {!docked &&
                    (mode.mode === 'search' ? (
                        <ToolbarButton
                            title={t('playlist.closeSearch')}
                            className={styles.active}
                            onClick={() => mode.setQuery(null)}
                        >
                            <Icon>search</Icon>
                        </ToolbarButton>
                    ) : (
                        <span />
                    ))}
                <Menu
                    title={t('playlist.selectedActions')}
                    icon="more_horiz"
                    Button={ToolbarButton}
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
        );
    else
        buttons = (
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
                {!docked && (
                    <ToolbarButton
                        title={t('playlist.search')}
                        className={clsx(mode.query !== null && styles.active)}
                        onClick={() => mode.setQuery(mode.query === null ? '' : null)}
                    >
                        <Icon>search</Icon>
                    </ToolbarButton>
                )}
                <Menu
                    title={t('playlist.more')}
                    icon="more_horiz"
                    Button={ToolbarButton}
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
        );

    return (
        <div className={styles.toolbar}>
            {docked && (
                <SearchField
                    className={styles.search}
                    value={mode.query ?? ''}
                    onChange={value => mode.setQuery(value === '' ? null : value)}
                />
            )}
            {buttons}
        </div>
    );
}

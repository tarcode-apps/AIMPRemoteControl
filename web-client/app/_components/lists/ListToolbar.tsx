'use client';

import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { media } from '@/app/_styles/media';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolbarButton } from '../buttons';
import { Icon } from '../icons';
import { SearchField } from '../inputs';
import { Menu, type MenuItem } from '../menus';
import type { ListModeValue } from './ListMode';
import styles from './ListToolbar.module.scss';

export type ListToolbarProps = {
    mode: ListModeValue;
    searchPlaceholder: string;
    // The first three slots while nothing is going on; the search and the menu
    // follow them.
    idle: ReactNode;
    moreActions: MenuItem[];
    selectedActions: MenuItem[];
    // Replaces everything while sorting.
    sorting?: ReactNode;
    // A search that is not a mode of the list: the field shows it when docked, and
    // a phone has it in the app bar, so the toolbar's own search button is left out.
    externalSearch?: { value: string; onChange(value: string): void };
};

// The toolbar of a list: fixed slots, so a button that replaces another in a
// different mode stays put, and the selection's buttons the same for every list.
export function ListToolbar({
    mode,
    searchPlaceholder,
    idle,
    moreActions,
    selectedActions,
    sorting,
    externalSearch,
}: ListToolbarProps) {
    const { t } = useTranslation();
    const docked = useMediaQuery(media.drawerDocked);

    let buttons;
    if (mode.mode === 'sort') buttons = sorting;
    else if (mode.selecting)
        buttons = (
            <>
                <ToolbarButton
                    title={t(mode.allSelected ? 'playlist.deselectAll' : 'playlist.selectAll')}
                    onClick={mode.toggleAll}
                >
                    <Icon>{mode.allSelected ? 'deselect' : 'select_all'}</Icon>
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
                    items={selectedActions}
                />
            </>
        );
    else
        buttons = (
            <>
                {idle}
                {!docked &&
                    (externalSearch ? (
                        <span />
                    ) : (
                        <ToolbarButton
                            title={t('playlist.search')}
                            className={clsx(mode.query !== null && styles.active)}
                            onClick={() => mode.setQuery(mode.query === null ? '' : null)}
                        >
                            <Icon>search</Icon>
                        </ToolbarButton>
                    ))}
                <Menu title={t('playlist.more')} icon="more_horiz" Button={ToolbarButton} items={moreActions} />
            </>
        );

    return (
        <div className={styles.toolbar}>
            {docked && (
                <SearchField
                    className={styles.search}
                    placeholder={searchPlaceholder}
                    value={externalSearch ? externalSearch.value : (mode.query ?? '')}
                    onChange={
                        externalSearch ? externalSearch.onChange : value => mode.setQuery(value === '' ? null : value)
                    }
                />
            )}
            {buttons}
        </div>
    );
}

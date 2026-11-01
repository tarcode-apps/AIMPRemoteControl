'use client';

import { ToolbarButton } from '@/app/_components/buttons';
import { Icon } from '@/app/_components/icons';
import toolbarStyles from '@/app/_components/lists/ListToolbar.module.scss';
import { Menu } from '@/app/_components/menus';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFilesMode } from './FilesMode';
import { FilesSortDialog } from './FilesSortDialog';

// The same five slots as a list's toolbar.
export function FilesToolbar() {
    const { t } = useTranslation();
    const mode = useFilesMode();
    const [sortDialog, setSortDialog] = useState(false);
    const entries = mode.folders.length + mode.files.length;

    return (
        <div className={toolbarStyles.toolbar}>
            <ToolbarButton
                title={t(mode.allSelected ? 'playlist.deselectAll' : 'playlist.selectAll')}
                disabled={entries === 0}
                onClick={() => mode.setAllSelected(!mode.allSelected)}
            >
                <Icon>{mode.allSelected ? 'deselect' : 'select_all'}</Icon>
            </ToolbarButton>
            <span />
            <span />
            <ToolbarButton
                title={mode.selected.size ? t('files.addSelected', { count: mode.selected.size }) : t('files.leave')}
                disabled={mode.adding}
                onClick={mode.selected.size ? mode.addSelected : mode.leave}
            >
                <Icon>check</Icon>
            </ToolbarButton>
            <Menu
                title={t('playlist.more')}
                icon="more_horiz"
                Button={ToolbarButton}
                items={[
                    {
                        label: t('playlist.sortBy'),
                        icon: 'sort',
                        disabled: mode.path === '',
                        onSelect: () => setSortDialog(true),
                    },
                ]}
            />
            {sortDialog && (
                <FilesSortDialog sort={mode.sort} onClose={() => setSortDialog(false)} onSubmit={mode.setSort} />
            )}
        </div>
    );
}

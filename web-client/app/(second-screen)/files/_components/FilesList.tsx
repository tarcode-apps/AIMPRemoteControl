'use client';

import { errorMessage } from '@/app/_api/helpers/errors';
import type { FileEntry, FileRoot, FolderEntry } from '@/app/_api/types';
import { Icon } from '@/app/_components/icons';
import { ListCheckbox } from '@/app/_components/inputs';
import listStyles from '@/app/_components/lists/ListPage.module.scss';
import { Skeleton } from '@/app/_components/skeleton';
import { formatSize } from '@/app/_utils/format';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './FilesList.module.scss';
import { useFilesMode } from './FilesMode';

const rowHeight = 48;
const overscanRows = 8;
const pendingRows = 8;
// Placeholder names of varying length, so that the rows do not read as one block.
const skeletonWidths = ['45%', '75%', '60%'];

type Row =
    { kind: 'root'; root: FileRoot } | { kind: 'folder'; folder: FolderEntry } | { kind: 'file'; file: FileEntry };

function rootName(root: FileRoot) {
    return root.label ? `${root.label} (${root.path})` : root.path;
}

export function FilesList() {
    const { t, i18n } = useTranslation();
    const mode = useFilesMode();
    const scrollRef = useRef<HTMLDivElement>(null);

    const rows: Row[] = mode.roots
        ? mode.roots.map(root => ({ kind: 'root', root }))
        : [
              ...mode.folders.map((folder): Row => ({ kind: 'folder', folder })),
              ...mode.files.map((file): Row => ({ kind: 'file', file })),
          ];

    // eslint-disable-next-line react-hooks/incompatible-library -- the compiler skips this component, which is fine here
    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => rowHeight,
        overscan: overscanRows,
    });

    let content;
    if (mode.error)
        content = (
            <div className={listStyles.message}>
                <p>{errorMessage(mode.error, t)}</p>
                <button className={listStyles.retry} onClick={mode.refetch}>
                    {t('actions.retry')}
                </button>
            </div>
        );
    else if (mode.pending)
        content = (
            <div className={listStyles.list}>
                {Array.from({ length: pendingRows }, (_, i) => (
                    <div
                        key={i}
                        className={styles.row}
                        style={{ height: rowHeight, transform: `translateY(${i * rowHeight}px)` }}
                    >
                        <Skeleton shape="rect" width={24} height={24} />
                        <span className={styles.name}>
                            <Skeleton width={skeletonWidths[i % skeletonWidths.length]} />
                        </span>
                    </div>
                ))}
            </div>
        );
    else if (rows.length === 0) content = <p className={listStyles.message}>{t('files.empty')}</p>;
    else
        content = (
            <div className={listStyles.list} style={{ height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map(({ index, start }) => {
                    const row = rows[index];
                    const style = { height: rowHeight, transform: `translateY(${start}px)` };
                    if (row.kind === 'root')
                        return (
                            <button
                                key={row.root.path}
                                type="button"
                                className={clsx(styles.row, styles.open)}
                                style={style}
                                onClick={() => mode.open(row.root.path)}
                            >
                                <Icon className={styles.icon}>hard_drive</Icon>
                                <span className={styles.name}>{rootName(row.root)}</span>
                                <Icon className={styles.chevron}>chevron_right</Icon>
                            </button>
                        );
                    if (row.kind === 'folder') {
                        const { folder } = row;
                        const selected = mode.selected.has(folder.path);
                        return (
                            <div key={folder.path} className={styles.row} style={style} data-testid="folder-row">
                                <ListCheckbox
                                    title={t('files.selectFolder')}
                                    checked={selected}
                                    onChange={event => mode.setSelected(folder.path, event.target.checked)}
                                />
                                <button type="button" className={styles.open} onClick={() => mode.open(folder.path)}>
                                    <Icon className={styles.icon}>folder</Icon>
                                    <span className={styles.name}>{folder.name}</span>
                                    <Icon className={styles.chevron}>chevron_right</Icon>
                                </button>
                            </div>
                        );
                    }
                    const { file } = row;
                    const selected = mode.selected.has(file.path);
                    return (
                        <label key={file.path} className={styles.row} style={style} data-testid="file-row">
                            <ListCheckbox
                                title={t('files.selectFile')}
                                checked={selected}
                                onChange={event => mode.setSelected(file.path, event.target.checked)}
                            />
                            <Icon className={styles.icon}>
                                {file.type === 'playlist' ? 'queue_music' : 'music_note'}
                            </Icon>
                            <span className={styles.name}>{file.name}</span>
                            <span className={styles.size}>{formatSize(file.size, i18n.language)}</span>
                        </label>
                    );
                })}
            </div>
        );

    return (
        <div ref={scrollRef} className={listStyles.page}>
            {content}
        </div>
    );
}

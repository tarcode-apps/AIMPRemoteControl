'use client';

import type { Playlist, PlaylistGroup, PlaylistItem } from '@/app/_api/types';
import { formatDuration } from '@/app/_utils/format';
import clsx from 'clsx';
import type { CSSProperties, PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../buttons';
import { ItemCover } from '../cover';
import { Icon } from '../icons';
import { ListCheckbox } from '../inputs';
import type { RowMenuButton } from '../menus';
import { Skeleton } from '../skeleton';
import styles from './ListPage.module.scss';

export const twoLineRowHeight = 56;
export const oneLineRowHeight = 44;
// The thumbnail is square and leaves this much of the row above and below.
export const thumbnailMargin = 6;

// What a list shows of its items: a playlist's own view settings, or fixed ones.
export type RowView = Pick<Playlist, 'showNumbers' | 'showThumbnails' | 'showSecondLine' | 'showDuration'>;

export type RowProps = {
    view: RowView;
    docked: boolean;
    thumbnailSize: number;
    // The widest number on screen, which every number cell renders invisibly to
    // size itself by: the rows are positioned absolutely and share no grid.
    widestNumber: string;
    selecting: boolean;
    sorting: boolean;
};

export type ItemRowProps = RowProps & {
    item: PlaylistItem;
    // The playlist the item belongs to, at the revision the item was read.
    playlistId: string;
    revision: number;
    number: number;
    // The track's place in the playback queue, shown before the duration.
    queueMark?: string;
    selected: boolean;
    onSelect(selected: boolean): void;
    onDragStart?(event: PointerEvent): void;
    menu?: RowMenuButton;
};

export function DragHandle({
    onDragStart,
    className,
}: {
    onDragStart?(event: PointerEvent): void;
    className?: string;
}) {
    const { t } = useTranslation();
    return (
        <span
            className={clsx(styles.leading, styles.handle, className)}
            title={onDragStart && t('playlist.dragHandle')}
            onPointerDown={onDragStart}
        >
            <Icon>drag_indicator</Icon>
        </span>
    );
}

export function ItemRow({
    item,
    playlistId,
    revision,
    number,
    view,
    docked,
    thumbnailSize,
    widestNumber,
    selecting,
    sorting,
    queueMark,
    selected,
    onSelect,
    onDragStart,
    menu,
}: ItemRowProps) {
    const { t } = useTranslation();
    const label = view.showNumbers && `${number}.`;
    return (
        <>
            {selecting && (
                <span className={styles.leading}>
                    <ListCheckbox
                        title={t('playlist.selectItem')}
                        tabIndex={-1}
                        checked={selected}
                        onChange={event => onSelect(event.target.checked)}
                        onClick={event => event.stopPropagation()}
                    />
                </span>
            )}
            {sorting && <DragHandle onDragStart={onDragStart} />}
            {label && docked && (
                <div className={styles.number} data-widest={widestNumber}>
                    {label}
                </div>
            )}
            {view.showThumbnails && (
                <ItemCover
                    playlistId={playlistId}
                    index={item.index}
                    coverKey={item.cover}
                    revision={revision}
                    size={thumbnailSize}
                    className={styles.thumbnail}
                />
            )}
            <div className={styles.text}>
                <div className={styles.title}>
                    {label && !docked && `${label} `}
                    {item.displayText}
                </div>
                {view.showSecondLine && <div className={styles.details}>{item.secondLine}</div>}
            </div>
            {queueMark && (
                <div className={styles.queueMark} title={t('playlist.inQueue')}>
                    {queueMark}
                </div>
            )}
            {view.showDuration && <div className={styles.duration}>{formatDuration(item.duration)}</div>}
            {menu && (
                <IconButton
                    title={t('playlist.itemActions')}
                    aria-haspopup="menu"
                    aria-expanded={menu.open}
                    tabIndex={-1}
                    className={clsx(styles.menuButton, menu.open && styles.menuButtonOpen)}
                    style={{ anchorName: menu.anchor } as CSSProperties}
                    popoverTarget={menu.popoverTarget}
                    popoverTargetAction="show"
                    // The row's own clicks would play the track.
                    onDoubleClick={event => event.stopPropagation()}
                    onClick={event => {
                        event.stopPropagation();
                        menu.onOpen();
                    }}
                >
                    <Icon>more_vert</Icon>
                </IconButton>
            )}
        </>
    );
}

export function SkeletonRow({ view, docked, thumbnailSize, widestNumber, selecting, sorting }: RowProps) {
    return (
        <>
            {selecting && (
                <span className={styles.leading}>
                    <Skeleton shape="rect" width={16} height={16} />
                </span>
            )}
            {sorting && <DragHandle />}
            {view.showNumbers && docked && (
                <div className={styles.number} data-widest={widestNumber}>
                    <Skeleton width="100%" />
                </div>
            )}
            {view.showThumbnails && (
                <Skeleton shape="rect" className={styles.thumbnail} width={thumbnailSize} height={thumbnailSize} />
            )}
            <div className={styles.text}>
                <Skeleton className={styles.title} width="60%" />
                {view.showSecondLine && <Skeleton className={styles.details} width="40%" />}
            </div>
            {view.showDuration && <Skeleton className={styles.duration} width="2.5em" />}
        </>
    );
}

export function GroupRow({ group, onToggle }: { group: PlaylistGroup; onToggle?(): void }) {
    const { t } = useTranslation();
    if (!onToggle)
        return (
            <div className={styles.groupButton}>
                <div className={styles.groupName}>{group.name}</div>
                <div className={styles.groupCount}>{group.count}</div>
            </div>
        );
    return (
        <button
            type="button"
            className={styles.groupButton}
            aria-expanded={group.expanded}
            tabIndex={-1}
            title={t(group.expanded ? 'playlist.collapseGroup' : 'playlist.expandGroup')}
            onClick={onToggle}
        >
            <div className={styles.groupName}>{group.name}</div>
            <div className={styles.groupCount}>{group.count}</div>
            <Icon className={styles.groupChevron}>{group.expanded ? 'expand_less' : 'expand_more'}</Icon>
        </button>
    );
}

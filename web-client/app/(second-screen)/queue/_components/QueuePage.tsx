'use client';

import { errorMessage } from '@/app/_api/helpers/errors';
import { usePlayer } from '@/app/_api/player';
import { usePlaylists } from '@/app/_api/playlists';
import { useMoveQueueItems, useQueue, useRemoveFromQueue } from '@/app/_api/queue';
import type { QueueItem } from '@/app/_api/types';
import {
    ItemRow,
    PlaylistRows,
    SkeletonRow,
    thumbnailMargin,
    twoLineRowHeight,
    useActiveRow,
    usePlaylistDrag,
    type RowView,
} from '@/app/_components/lists';
import styles from '@/app/_components/lists/ListPage.module.scss';
import { useRowMenu } from '@/app/_components/menus';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { media } from '@/app/_styles/media';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { useId, useLayoutEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueueMode } from './QueueMode';

const overscanRows = 6;
const pendingRows = 6;
const view: RowView = { showNumbers: true, showThumbnails: true, showSecondLine: true, showDuration: true };

export function QueuePage() {
    const { t } = useTranslation();
    const docked = useMediaQuery(media.drawerDocked);
    const scrollRef = useRef<HTMLDivElement>(null);
    const listId = useId();
    const mode = useQueueMode();
    const { items } = mode;
    const query = useQueue();
    const queue = query.data;
    const { data: playlists } = usePlaylists();
    const revisions = new Map(playlists?.map(playlist => [playlist.id, playlist.revision]));
    const searching = mode.text !== '';
    const selecting = mode.selecting;
    // The handles are out while the checkboxes are in; a search lists other positions.
    const sortable = mode.mode === null && !searching;

    const rows = useMemo(() => new PlaylistRows(items.length, undefined), [items.length]);
    const collapsed = useRef<(row: number) => boolean>(() => false);
    // eslint-disable-next-line react-hooks/incompatible-library -- the compiler skips this component, which is fine here
    const virtualizer = useVirtualizer({
        count: rows.count,
        getScrollElement: () => scrollRef.current,
        estimateSize: row => (collapsed.current(row) ? 0 : twoLineRowHeight),
        overscan: overscanRows,
    });
    const active = useActiveRow(rows, row => virtualizer.scrollToIndex(row, { align: 'auto' }));
    const virtualRows = virtualizer.getVirtualItems();

    const move = useMoveQueueItems();
    const remove = useRemoveFromQueue();
    const rowMenu = useRowMenu((item: QueueItem) => [
        {
            label: t('queue.remove'),
            icon: 'delete',
            onSelect: () => remove.mutate({ positions: [item.position], revision: queue?.revision }),
        },
    ]);

    const drag = usePlaylistDrag({
        enabled: sortable,
        scrollRef,
        rows,
        virtualizer,
        revisionOf: () => queue?.revision,
        onDrop: (row, boundary) => {
            const target = boundary > row ? boundary - 1 : boundary;
            if (target === row) {
                drag.reset();
                return;
            }
            move.mutate(
                { positions: [items[row].position], target, revision: queue?.revision },
                { onError: () => drag.reset() },
            );
        },
    });
    collapsed.current = drag.hidden;
    const dragged = drag.state?.source;
    useLayoutEffect(() => virtualizer.measure(), [rows, virtualizer, dragged]);

    const { data: player } = usePlayer();
    const playing = player?.track;
    const isPlaying = (item: QueueItem) => playing?.playlistId === item.playlistId && playing.index === item.index;

    const toggleSelected = (item: QueueItem) => mode.setSelected([item.position], !mode.isSelected(item.position));

    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (rows.count === 0) return;
        const pageRows = Math.max(1, Math.floor(event.currentTarget.clientHeight / twoLineRowHeight) - 1);
        const item = active.row === null ? undefined : items[active.row];
        if (active.move(event.key, rows.count, pageRows)) event.preventDefault();
        else if (event.key === ' ' && item && selecting) {
            toggleSelected(item);
            event.preventDefault();
        }
    };

    const onItemClick = (event: MouseEvent, row: number, item: QueueItem) => {
        if (mode.mode === 'select') {
            toggleSelected(item);
            return;
        }
        // Nothing plays from here: a track started by hand would stay in the queue and
        // come up again as the next one. A mouse click only moves the cursor.
        const { pointerType } = event.nativeEvent as PointerEvent;
        if (pointerType === 'mouse') active.select(rows.keyAt(row));
    };

    const rowId = (row: number) => `${listId}-${row}`;
    const widestNumber = `${'0'.repeat(Math.max(1, String(items.length).length))}.`;
    const rowProps = {
        view,
        docked,
        thumbnailSize: twoLineRowHeight - 2 * thumbnailMargin,
        widestNumber,
        selecting,
        sorting: sortable,
    };
    const itemProps = (item: QueueItem) => ({
        ...rowProps,
        item,
        playlistId: item.playlistId,
        revision: revisions.get(item.playlistId) ?? 0,
        number: item.position + 1,
    });

    let ghost = null;
    if (drag.state) {
        const item = items[drag.state.source.row];
        const style = { height: drag.state.source.ghostHeight, transform: `translateY(${drag.state.top}px)` };
        ghost = (
            <div className={clsx(styles.row, styles.ghost)} style={style}>
                {item ? (
                    <ItemRow {...itemProps(item)} selected={false} onSelect={() => {}} />
                ) : (
                    <SkeletonRow {...rowProps} />
                )}
            </div>
        );
    }

    return (
        <section
            ref={scrollRef}
            className={clsx(styles.page, active.byKeyboard && styles.keyboard)}
            aria-label={t('screens.queue')}
            role="listbox"
            tabIndex={0}
            aria-activedescendant={active.row === null ? undefined : rowId(active.row)}
            onKeyDown={onKeyDown}
            // Word selection starts on the second press of a double click.
            onMouseDown={event => {
                if (event.detail > 1) event.preventDefault();
            }}
        >
            {query.isError ? (
                <div className={styles.message}>
                    <p>{errorMessage(query.error, t)}</p>
                    <button className={styles.retry} onClick={() => query.refetch()}>
                        {t('actions.retry')}
                    </button>
                </div>
            ) : query.isPending ? (
                <div className={styles.list}>
                    {Array.from({ length: pendingRows }, (_, i) => (
                        <div
                            key={i}
                            className={styles.row}
                            style={{ height: twoLineRowHeight, transform: `translateY(${i * twoLineRowHeight}px)` }}
                        >
                            <SkeletonRow {...rowProps} />
                        </div>
                    ))}
                </div>
            ) : items.length === 0 ? (
                <p className={styles.message}>{t(searching ? 'playlist.noResults' : 'queue.empty')}</p>
            ) : (
                <div
                    className={clsx(styles.list, drag.state && !drag.settled && styles.dragging)}
                    style={{ height: virtualizer.getTotalSize() + (drag.state?.source.ghostHeight ?? 0) }}
                >
                    {virtualRows.map(({ index, start }) => {
                        const item = items[index];
                        const isActive = active.row === index;
                        const transform = `translateY(${start + drag.shift(index)}px)`;
                        return (
                            <div
                                key={index}
                                id={rowId(index)}
                                role="option"
                                aria-selected={isActive}
                                className={clsx(
                                    styles.row,
                                    index % 2 && styles.odd,
                                    isActive && styles.active,
                                    isPlaying(item) && styles.playing,
                                    drag.hidden(index) && styles.hidden,
                                )}
                                style={{ height: twoLineRowHeight, transform }}
                                onClick={event => onItemClick(event, index, item)}
                            >
                                <ItemRow
                                    {...itemProps(item)}
                                    selected={selecting && mode.isSelected(item.position)}
                                    onSelect={selected => mode.setSelected([item.position], selected)}
                                    onDragStart={event => drag.start(index, event)}
                                    menu={selecting ? undefined : rowMenu.button(index, item)}
                                />
                            </div>
                        );
                    })}
                    {ghost}
                </div>
            )}
            {rowMenu.popover}
        </section>
    );
}

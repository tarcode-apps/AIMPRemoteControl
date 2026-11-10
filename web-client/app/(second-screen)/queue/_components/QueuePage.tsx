'use client';

import { errorMessage } from '@/app/_api/helpers/errors';
import { usePlayer } from '@/app/_api/player';
import { usePlaylists } from '@/app/_api/playlists';
import { useMoveQueueItems, useQueue } from '@/app/_api/queue';
import type { QueueItem } from '@/app/_api/types';
import {
    FastScroll,
    fixedRowView,
    ItemRow,
    overscanRows,
    PlaylistRows,
    SkeletonRow,
    thumbnailMargin,
    twoLineRowHeight,
    useActiveRow,
    usePlaylistDrag,
    useRowKeys,
    useSearchKeys,
    useSelectionKeys,
} from '@/app/_components/lists';
import styles from '@/app/_components/lists/ListPage.module.scss';
import { useRowMenu } from '@/app/_components/menus';
import { useErrorToast } from '@/app/_components/toast';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { useOnChange } from '@/app/_hooks/useOnChange';
import { useFavoriteActions } from '@/app/_state/useFavoriteActions';
import { useTrackActions } from '@/app/_state/useTrackActions';
import { media } from '@/app/_styles/media';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueueMode } from './QueueMode';

const pendingRows = 6;

export function QueuePage() {
    const { t } = useTranslation();
    const showError = useErrorToast();
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
    const sorting = mode.mode === 'sort';
    // The handles are out while the checkboxes are in; a search lists other positions.
    const sortable = mode.mode === null && !searching;

    const rows = useMemo(() => new PlaylistRows(items.length, undefined), [items.length]);
    const collapsed = useRef<(row: number) => boolean>(() => false);
    const [thumbDragging, setThumbDragging] = useState(false);
    // eslint-disable-next-line react-hooks/incompatible-library -- the compiler skips this component, which is fine here
    const virtualizer = useVirtualizer({
        count: rows.count,
        getScrollElement: () => scrollRef.current,
        estimateSize: row => (collapsed.current(row) ? 0 : twoLineRowHeight),
        overscan: thumbDragging ? 0 : overscanRows,
    });
    const active = useActiveRow(rows, row => virtualizer.scrollToIndex(row, { align: 'auto' }));
    const virtualRows = virtualizer.getVirtualItems();
    // The rows are the search's: the cursor goes with a change of the text.
    useOnChange(mode.text, () => active.select(null));

    const move = useMoveQueueItems();
    const favoriteActions = useFavoriteActions();
    const trackActions = useTrackActions();
    const rowMenu = useRowMenu((item: QueueItem) => [
        trackActions.infoItem(item),
        favoriteActions.favoriteMenuItem({ ...item, revision: revisions.get(item.playlistId) }),
        { label: t('queue.remove'), icon: 'delete', onSelect: () => mode.removeFromQueue([item]) },
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
            active.select({ kind: 'item', position: target });
            move.mutate(
                { positions: [items[row].position], target, revision: queue?.revision },
                {
                    onError: error => {
                        drag.reset();
                        showError(error);
                    },
                },
            );
        },
    });
    collapsed.current = drag.hidden;
    const dragged = drag.state?.source;
    useLayoutEffect(() => virtualizer.measure(), [rows, virtualizer, dragged]);

    const { data: player } = usePlayer();
    const playing = player?.track;
    const isPlaying = (item: QueueItem) => playing?.playlistId === item.playlistId && playing.index === item.index;

    const keys = useSelectionKeys({
        mode,
        rows,
        active,
        list: scrollRef,
        disabled: sorting,
        dragging: drag.state !== null,
    });
    // Nothing plays from the queue, so Enter stays the field's.
    useSearchKeys({ mode, rows, active, list: scrollRef, disabled: sorting });
    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (rows.count === 0) return;
        const pageRows = Math.max(1, Math.floor(event.currentTarget.clientHeight / twoLineRowHeight) - 1);
        if (keys.onKeyDown(event, rows.count, pageRows)) return;
        const item = active.row === null ? undefined : items[active.row];
        if (active.move(event.key, rows.count, pageRows) !== null) event.preventDefault();
        else if (event.key === ' ' && active.row !== null && selecting) {
            keys.toggle(rows.at(active.row));
            event.preventDefault();
        } else if (event.key === 'Delete' && !sorting) {
            mode.removeFromQueue(selecting ? mode.selectedItems() : item ? [item] : []);
            event.preventDefault();
        }
    };

    const onItemClick = (event: MouseEvent, row: number) => {
        if (mode.mode === 'select') {
            keys.pick(row, () => keys.toggle(rows.at(row)));
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
        view: fixedRowView,
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
                    <SkeletonRow {...rowProps} index={drag.state.source.row} />
                )}
            </div>
        );
    }

    const rowKey = useRowKeys(
        virtualRows.map(row => row.index),
        () => 'item',
        !drag.state,
    );

    return (
        <FastScroll scrollRef={scrollRef} onDragChange={setThumbDragging}>
            <section
                ref={scrollRef}
                className={clsx(styles.page, active.byKeyboard && styles.keyboard)}
                aria-label={t('screens.queue')}
                role="listbox"
                tabIndex={0}
                aria-activedescendant={active.row === null ? undefined : rowId(active.row)}
                onKeyDown={onKeyDown}
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
                                <SkeletonRow {...rowProps} index={i} />
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
                                    key={rowKey(index)}
                                    id={rowId(index)}
                                    role="option"
                                    data-testid="item-row"
                                    aria-selected={isActive}
                                    className={clsx(
                                        styles.row,
                                        index % 2 && styles.odd,
                                        isActive && styles.active,
                                        isPlaying(item) && styles.playing,
                                        drag.hidden(index) && styles.hidden,
                                    )}
                                    style={{ height: twoLineRowHeight, transform }}
                                    onClickCapture={event => keys.onRowClick(event, index)}
                                    onClick={event => onItemClick(event, index)}
                                >
                                    <ItemRow
                                        {...itemProps(item)}
                                        selected={selecting && mode.isSelected(index)}
                                        onSelect={selected =>
                                            keys.pick(index, () => keys.setSelected(rows.at(index), selected))
                                        }
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
        </FastScroll>
    );
}

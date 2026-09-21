'use client';

import { errorMessage } from '@/app/_api/errors';
import { usePlayer, usePlayTrack } from '@/app/_api/player';
import { useMovePlaylistItems, usePlaylistItems, useSetGroupExpanded } from '@/app/_api/playlists';
import type { Playlist, PlaylistGroup, PlaylistItem } from '@/app/_api/types';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { media } from '@/app/_styles/media';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ListCheckbox } from '../inputs';
import { usePlaylistMode } from './PlaylistMode';
import styles from './PlaylistPage.module.scss';
import { DragHandle, GroupRow, ItemRow, SkeletonRow } from './PlaylistRowContent';
import type { PlaylistRow } from './playlistRows';
import { usePlaylistSelection } from './PlaylistSelection';
import { useActiveRow } from './useActiveRow';
import { usePlaylistDrag } from './usePlaylistDrag';
import { pageSize, usePlaylistLayout } from './usePlaylistLayout';

const twoLineRowHeight = 56;
const oneLineRowHeight = 44;
const groupRowHeight = 40;
const overscanRows = 6;
const bufferPages = 1;
const pendingRows = 12;

export type PlaylistPageProps = {
    playlist: Playlist;
};

function pagesAround(positions: [number, number] | null, total: number) {
    if (!total || !positions) return [];
    const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    const first = Math.max(0, Math.floor(positions[0] / pageSize) - bufferPages);
    const last = Math.min(lastPage, Math.floor(positions[1] / pageSize) + bufferPages);
    return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

export function PlaylistPage({ playlist }: PlaylistPageProps) {
    const { t } = useTranslation();
    const docked = useMediaQuery(media.drawerDocked);
    const scrollRef = useRef<HTMLDivElement>(null);
    const listId = useId();
    const { selected } = usePlaylistSelection();
    const mode = usePlaylistMode();
    // The pager keeps the neighbouring playlists mounted with their plain lists.
    const mine = selected?.id === playlist.id;
    const text = mine ? mode.text : '';
    const searching = text !== '';
    const selecting = mine && mode.selecting;
    const sorting = mine && mode.mode === 'sort';
    const sortable = sorting && !playlist.readOnly;
    const itemRowHeight = playlist.showSecondLine ? twoLineRowHeight : oneLineRowHeight;

    const layout = usePlaylistLayout(playlist, text, searching || sorting);
    const { rows } = layout;
    const setExpanded = useSetGroupExpanded(playlist.id);
    const moveItems = useMovePlaylistItems(playlist.id);

    // Filled in by the drag hook below, which needs the virtualizer first.
    const collapsed = useRef<(row: number) => boolean>(() => false);
    // eslint-disable-next-line react-hooks/incompatible-library -- the compiler skips this component, which is fine here
    const virtualizer = useVirtualizer({
        count: rows.count,
        getScrollElement: () => scrollRef.current,
        estimateSize: row =>
            collapsed.current(row) ? 0 : rows.at(row).kind === 'group' ? groupRowHeight : itemRowHeight,
        overscan: overscanRows,
    });
    const active = useActiveRow(rows, row => virtualizer.scrollToIndex(row, { align: 'auto' }));
    const virtualRows = virtualizer.getVirtualItems();
    const first = virtualRows.at(0)?.index;
    const last = virtualRows.at(-1)?.index;
    const pages = pagesAround(
        first === undefined || last === undefined ? null : rows.positions(first, last),
        rows.count,
    );
    const queries = usePlaylistItems(
        playlist.id,
        pages.map(page => ({ offset: page * pageSize, limit: pageSize, search: text })),
    );
    const loaded = new Map(queries.flatMap((query, i) => (query.data ? [[pages[i], query.data] as const] : [])));
    const failed = [...layout.queries, ...queries].find(query => query.isError && !query.data);
    const pending = searching && layout.pending;
    const empty = !pending && rows.count === 0;

    const itemAt = (position: number) => {
        const page = loaded.get(Math.floor(position / pageSize));
        return page?.items[position - page.offset];
    };

    // The ghost keeps the item it started with: its page may unload while dragging far.
    const draggedItem = useRef<PlaylistItem | undefined>(undefined);
    const drag = usePlaylistDrag({
        enabled: sortable,
        scrollRef,
        rows,
        virtualizer,
        revisionOf: row => {
            const source = rows.at(row);
            return source.kind === 'group'
                ? layout.groupsRevision
                : loaded.get(Math.floor(source.position / pageSize))?.revision;
        },
        onDrop: (row, boundary) => {
            const source = rows.at(row);
            const before = boundary < rows.count ? rows.at(boundary) : null;
            const position = !before
                ? playlist.itemCount
                : before.kind === 'item'
                  ? before.position
                  : before.group.firstPosition;
            const [firstIndex, count] =
                source.kind === 'group' ? [source.group.firstPosition, source.group.count] : [source.position, 1];
            const target = position > firstIndex ? position - count : position;
            if (target === firstIndex) {
                drag.reset();
                return;
            }
            const indexes = Array.from({ length: count }, (_, i) => firstIndex + i);
            moveItems.mutate({ indexes, target, revision: playlist.revision }, { onError: () => drag.reset() });
        },
    });
    collapsed.current = drag.hidden;
    // Sizes are cached by index: a moved group changes which indexes are headers, and
    // a drag collapses a block.
    const dragged = drag.state?.source;
    useLayoutEffect(() => virtualizer.measure(), [rows, virtualizer, dragged]);

    const numberOf = (row: PlaylistRow, item: PlaylistItem | undefined) => {
        if (row.kind !== 'item') return undefined;
        if (searching) return item && item.index + 1;
        if (playlist.absoluteNumbers || !row.group) return row.position + 1;
        return row.position - row.group.firstPosition + 1;
    };

    const widestNumber = `${'0'.repeat(
        Math.max(
            1,
            ...virtualRows.map(virtualRow => {
                const row = rows.at(virtualRow.index);
                const number = numberOf(row, row.kind === 'item' ? itemAt(row.position) : undefined);
                return number === undefined ? 0 : String(number).length;
            }),
        ),
    )}.`;

    const groupSelection = (group: PlaylistGroup) => {
        let loadedCount = 0;
        let selectedCount = 0;
        for (let position = group.firstPosition; position < group.firstPosition + group.count; position++) {
            const item = itemAt(position);
            if (!item) continue;
            loadedCount++;
            if (mode.isSelected(item.index)) selectedCount++;
        }
        const checked = loadedCount === group.count && selectedCount === loadedCount && loadedCount > 0;
        return { checked, indeterminate: !checked && selectedCount > 0 };
    };

    const playTrack = usePlayTrack();
    const play = (item: PlaylistItem) =>
        playTrack.mutate({ playlistId: playlist.id, index: item.index, revision: playlist.revision });
    const { data: player } = usePlayer();
    const playingTrack = player?.track;
    // The index is only valid for the revision it was read at, and the snapshot and
    // the list catch up with a change one after the other: while their revisions
    // differ the last index stays in use, or the highlight would blink. The active
    // row follows the track, as in the player, except in a search, which lists
    // other positions.
    const [lastIndex, setLastIndex] = useState<number | null>(null);
    const matchedIndex =
        playingTrack?.playlistId === playlist.id
            ? playingTrack.playlistRevision === playlist.revision
                ? playingTrack.index
                : undefined
            : null;
    const playingIndex = matchedIndex === undefined ? lastIndex : matchedIndex;
    if (playingIndex !== null && playingIndex !== lastIndex) {
        setLastIndex(playingIndex);
        if (!searching) active.select({ kind: 'item', position: playingIndex });
    }

    const toggleGroup = (group: PlaylistGroup) => {
        if (!searching && !sorting)
            setExpanded.mutate({ index: group.index, expanded: !group.expanded, revision: playlist.revision });
    };

    const toggleSelected = (row: PlaylistRow, item: PlaylistItem | undefined) => {
        if (row.kind === 'group')
            void mode.setRangeSelected(row.group.firstPosition, row.group.count, !groupSelection(row.group).checked);
        else if (item) mode.setSelected([item.index], !mode.isSelected(item.index));
    };

    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (rows.count === 0) return;
        const pageRows = Math.max(1, Math.floor(event.currentTarget.clientHeight / itemRowHeight) - 1);
        const current = active.row === null ? null : rows.at(active.row);
        const item = current?.kind === 'item' ? itemAt(current.position) : undefined;
        if (active.move(event.key, rows.count, pageRows)) event.preventDefault();
        else if (event.key === 'Enter' && current) {
            if (current.kind === 'group') toggleGroup(current.group);
            else if (item && !sorting) play(item);
            event.preventDefault();
        } else if (event.key === ' ' && current && selecting) {
            toggleSelected(current, item);
            event.preventDefault();
        }
    };

    const onItemClick = (event: MouseEvent, row: number, item: PlaylistItem) => {
        if (mode.mode === 'select') {
            mode.setSelected([item.index], !mode.isSelected(item.index));
            return;
        }
        active.select(rows.keyAt(row));
        if (sorting) return;
        // Decided per gesture rather than per device: a tap plays at once, a mouse
        // click only selects and the double click plays.
        const { pointerType } = event.nativeEvent as PointerEvent;
        if (searching || pointerType !== 'mouse') play(item);
    };

    const rowId = (row: number) => `${listId}-${row}`;
    const rowProps = { playlist, docked, widestNumber, selecting, sorting: sortable };

    let ghost = null;
    if (drag.state) {
        const row = rows.at(drag.state.source.row);
        const item = row.kind === 'item' ? (itemAt(row.position) ?? draggedItem.current) : undefined;
        const style = { height: drag.state.source.ghostHeight, transform: `translateY(${drag.state.top}px)` };
        ghost =
            row.kind === 'group' ? (
                <div className={clsx(styles.groupRow, styles.ghost)} style={style}>
                    <DragHandle className={styles.groupHandle} />
                    <GroupRow group={row.group} />
                </div>
            ) : (
                <div className={clsx(styles.row, styles.ghost)} style={style}>
                    {item ? (
                        <ItemRow
                            {...rowProps}
                            item={item}
                            number={numberOf(row, item) ?? 0}
                            selected={false}
                            onSelect={() => {}}
                        />
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
            aria-label={playlist.name}
            role="listbox"
            tabIndex={0}
            aria-activedescendant={active.row === null ? undefined : rowId(active.row)}
            onKeyDown={onKeyDown}
            // Word selection starts on the second press of a double click.
            onMouseDown={event => {
                if (event.detail > 1) event.preventDefault();
            }}
        >
            {failed ? (
                <div className={styles.message}>
                    <p>{errorMessage(failed.error, t)}</p>
                    <button className={styles.retry} onClick={() => failed.refetch()}>
                        {t('actions.retry')}
                    </button>
                </div>
            ) : pending ? (
                <div className={styles.list}>
                    {Array.from({ length: pendingRows }, (_, i) => (
                        <div
                            key={i}
                            className={styles.row}
                            style={{ height: itemRowHeight, transform: `translateY(${i * itemRowHeight}px)` }}
                        >
                            <SkeletonRow {...rowProps} />
                        </div>
                    ))}
                </div>
            ) : empty ? (
                <p className={styles.message}>{t(searching ? 'playlist.noResults' : 'playlist.empty')}</p>
            ) : (
                <div
                    className={clsx(styles.list, drag.state && !drag.settled && styles.dragging)}
                    style={{ height: virtualizer.getTotalSize() + (drag.state?.source.ghostHeight ?? 0) }}
                >
                    {virtualRows.map(({ index, start }) => {
                        const row = rows.at(index);
                        const isActive = active.row === index;
                        const hidden = drag.hidden(index);
                        const transform = `translateY(${start + drag.shift(index)}px)`;
                        if (row.kind === 'group')
                            return (
                                <div
                                    key={index}
                                    id={rowId(index)}
                                    role="option"
                                    aria-selected={isActive}
                                    className={clsx(
                                        styles.groupRow,
                                        isActive && styles.active,
                                        hidden && styles.hidden,
                                    )}
                                    style={{ height: groupRowHeight, transform }}
                                >
                                    {selecting && (
                                        <ListCheckbox
                                            title={t('playlist.selectGroup')}
                                            tabIndex={-1}
                                            className={styles.groupCheckbox}
                                            {...groupSelection(row.group)}
                                            onChange={event =>
                                                mode.setRangeSelected(
                                                    row.group.firstPosition,
                                                    row.group.count,
                                                    event.target.checked,
                                                )
                                            }
                                        />
                                    )}
                                    {sortable && rows.spanAt(index)?.rowCount !== rows.count && (
                                        <DragHandle
                                            className={styles.groupHandle}
                                            onDragStart={event => drag.start(index, event)}
                                        />
                                    )}
                                    <GroupRow
                                        group={row.group}
                                        onToggle={searching || sorting ? undefined : () => toggleGroup(row.group)}
                                    />
                                </div>
                            );
                        const item = itemAt(row.position);
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
                                    item && item.index === playingIndex && styles.playing,
                                    hidden && styles.hidden,
                                )}
                                style={{ height: itemRowHeight, transform }}
                                onClick={event => item && onItemClick(event, index, item)}
                                onDoubleClick={() => item && mode.mode === null && play(item)}
                            >
                                {item ? (
                                    <ItemRow
                                        {...rowProps}
                                        item={item}
                                        number={numberOf(row, item) ?? 0}
                                        selected={selecting && mode.isSelected(item.index)}
                                        onSelect={selected => mode.setSelected([item.index], selected)}
                                        onDragStart={event => {
                                            draggedItem.current = item;
                                            drag.start(index, event);
                                        }}
                                    />
                                ) : (
                                    <SkeletonRow {...rowProps} />
                                )}
                            </div>
                        );
                    })}
                    {ghost}
                </div>
            )}
        </section>
    );
}

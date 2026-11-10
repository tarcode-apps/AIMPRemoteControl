'use client';

import { usePlayer } from '@/app/_api/player';
import { queueMark, trackKey, useEnqueue, useQueuePositions } from '@/app/_api/queue';
import type { LocatedItem, PlaylistGroup, PlaylistItem } from '@/app/_api/types';
import { Checkbox } from '@/app/_components/inputs';
import {
    FastScroll,
    fixedRowView,
    GroupRow,
    groupRowHeight,
    ItemRow,
    overscanRows,
    positionsCheckState,
    RowMenuIcon,
    SkeletonRow,
    thumbnailMargin,
    topGroupName,
    twoLineRowHeight,
    useActiveRow,
    useFoldingItems,
    usePlaylistDrag,
    useRowKeys,
    useSearchKeys,
    useSelectionKeys,
    type PlaylistRow,
} from '@/app/_components/lists';
import styles from '@/app/_components/lists/ListPage.module.scss';
import { menuSeparator, useRowMenu } from '@/app/_components/menus';
import { useItemRemoval, useTrackDownload } from '@/app/_components/playlists';
import { useErrorToast } from '@/app/_components/toast';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { useOnChange } from '@/app/_hooks/useOnChange';
import { useFavoriteRelink, useFavorites, type FavoriteRecord } from '@/app/_state/Favorites';
import { useNavigation } from '@/app/_state/Navigation';
import { useTrackActions } from '@/app/_state/useTrackActions';
import { media } from '@/app/_styles/media';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { selectionOf, useFavoritesMode, type FavoriteEntry } from './FavoritesMode';

// What a row shows of a favorite that is not in its playlist: its snapshot.
function snapshotItem(record: FavoriteRecord): PlaylistItem {
    return {
        index: -1,
        displayText: record.displayText,
        secondLine: record.secondLine,
        duration: record.duration,
        size: record.size,
        mark: 0,
        rating: 0,
        displayingMark: 0,
        enabled: true,
        isUrl: record.isUrl,
        inContainer: false,
        cover: '',
        fileUri: record.fileUri,
    };
}

export function FavoritesPage() {
    const { t } = useTranslation();
    const showError = useErrorToast();
    const { openSecondScreen } = useNavigation();
    const docked = useMediaQuery(media.drawerDocked);
    const scrollRef = useRef<HTMLDivElement>(null);
    const listId = useId();
    const mode = useFavoritesMode();
    const { entries, rows, selecting } = mode;
    const favorites = useFavorites();
    const { startRelink } = useFavoriteRelink();
    const searching = mode.text !== '';
    const sorting = mode.mode === 'sort';
    // A search lists other positions than the list the order belongs to.
    const sortable = sorting && !searching;

    // Filled in by the drag hook below, which needs the virtualizer first.
    const collapsed = useRef<(row: number) => boolean>(() => false);
    const [thumbDragging, setThumbDragging] = useState(false);
    // eslint-disable-next-line react-hooks/incompatible-library -- the compiler skips this component, which is fine here
    const virtualizer = useVirtualizer({
        count: rows.count,
        getScrollElement: () => scrollRef.current,
        estimateSize: row =>
            collapsed.current(row) ? 0 : rows.at(row).kind === 'group' ? groupRowHeight : twoLineRowHeight,
        overscan: thumbDragging ? 0 : overscanRows,
    });
    const active = useActiveRow(rows, row => virtualizer.scrollToIndex(row, { align: 'auto' }));
    const virtualRows = virtualizer.getVirtualItems();

    const drag = usePlaylistDrag({
        enabled: sortable,
        scrollRef,
        rows,
        virtualizer,
        revisionOf: () => favorites.revision,
        onDrop: (row, boundary) => {
            const source = rows.at(row);
            const before = boundary < rows.count ? rows.at(boundary) : null;
            const position = !before
                ? entries.length
                : before.kind === 'item'
                  ? before.position
                  : before.group.firstPosition;
            if (source.kind !== 'item') {
                drag.reset();
                return;
            }
            const target = position > source.position ? position - 1 : position;
            if (target === source.position) {
                drag.reset();
                return;
            }
            favorites.move([entries[source.position].record.fileUri], target);
        },
    });
    collapsed.current = drag.hidden;
    const dragged = drag.state?.source;
    useLayoutEffect(() => virtualizer.measure(), [rows, virtualizer, dragged]);

    const trackActions = useTrackActions();
    const play = trackActions.play;
    const { data: player } = usePlayer();
    const playing = player?.track;
    const isPlaying = (located: LocatedItem) =>
        playing?.playlistId === located.playlistId && playing.index === located.index;
    // The cursor follows the playing track, by file so that it survives a reorder,
    // except in a search, which lists other positions. On a phone the cursor is
    // the track's alone: it goes away when what plays is not here, and sorting
    // keeps the user from moving it. Docked, the user moves it freely and a track
    // elsewhere leaves it be.
    const playingUri = entries.find(({ located }) => located && isPlaying(located))?.record.fileUri ?? null;
    const playingPosition = entries.findIndex(({ record }) => record.fileUri === playingUri);
    const playingRow = playingPosition < 0 ? null : ({ kind: 'item', position: playingPosition } as const);
    const [followedUri, setFollowedUri] = useState<string | null>(null);
    if (playingUri !== followedUri) {
        setFollowedUri(playingUri);
        if (!searching && (playingRow || !docked)) active.select(playingRow);
    }
    // The positions are the search's: the cursor goes with a change of the text,
    // to the playing track where the list shows it.
    useOnChange(mode.text, () => active.select(playingRow));

    const queuePositions = useQueuePositions();
    const removal = useItemRemoval();
    const download = useTrackDownload();
    const rowMenu = useRowMenu((entry: FavoriteEntry) => {
        const { record, located } = entry;
        const remove = {
            label: t('favorites.remove'),
            icon: 'heart_minus',
            onSelect: () => mode.removeFavorites([entry]),
        };
        if (!located)
            return [
                {
                    label: t('favorites.find'),
                    icon: 'manage_search',
                    onSelect: () => {
                        startRelink(record.fileUri);
                        mode.leaveThen(() => openSecondScreen(`/search/?q=${encodeURIComponent(record.displayText)}`));
                    },
                },
                remove,
            ];
        // Sorting keeps a history entry, which has to go before the playlist shows.
        const showItem = trackActions.showItem(located);
        return [
            trackActions.infoItem(located),
            ...trackActions.enqueueItems(located),
            { ...showItem, onSelect: () => mode.leaveThen(showItem.onSelect) },
            remove,
            menuSeparator,
            ...removal.trackItems({ ...located, name: record.displayText }, mode.afterRemoval([entry])),
            ...download.trackItems(located),
        ];
    });

    // As a playlist's, over the group's favorites; only those in their playlists
    // can be queued or removed.
    const enqueue = useEnqueue();
    const foldingItems = useFoldingItems();
    const membersOf = (group: PlaylistGroup) => entries.slice(group.firstPosition, group.firstPosition + group.count);
    const groupMenu = useRowMenu((group: PlaylistGroup) => {
        const members = membersOf(group);
        const noTracks = !members.some(({ located }) => located);
        const enqueueMembers = (atBeginning: boolean) =>
            enqueue.mutate({ ...selectionOf(members), atBeginning }, { onError: showError });
        return [
            {
                label: t('playlist.enqueue'),
                icon: 'playlist_add',
                disabled: noTracks,
                onSelect: () => enqueueMembers(false),
            },
            {
                label: t('playlist.enqueueFirst'),
                icon: 'playlist_play',
                disabled: noTracks,
                onSelect: () => enqueueMembers(true),
            },
            {
                label: t('favorites.remove'),
                icon: 'heart_minus',
                onSelect: () => mode.removeFavorites(members),
            },
            menuSeparator,
            ...foldingItems(group, { toggle: mode.toggleGroup, setAll: mode.setAllExpanded }),
            menuSeparator,
            ...removal.selectionItems(() => selectionOf(members), mode.afterRemoval(members)),
        ];
    });

    // The groups are the client's, so the selection counts rows, not groups.
    const keys = useSelectionKeys({
        mode,
        rows,
        active,
        list: scrollRef,
        byGroups: false,
        disabled: sorting,
        dragging: drag.state !== null,
    });
    const groupCheckState = (group: PlaylistGroup) => positionsCheckState(group, mode.isSelected);
    // Enter: a header folds, an entry plays where its track is.
    const activate = (row: PlaylistRow) => {
        if (row.kind === 'group') mode.toggleGroup(row.group);
        else {
            const located = entries[row.position]?.located;
            if (located && !sorting) play(located);
        }
    };
    useSearchKeys({ mode, rows, active, list: scrollRef, disabled: sorting, onEnter: activate });
    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (rows.count === 0) return;
        const pageRows = Math.max(1, Math.floor(event.currentTarget.clientHeight / twoLineRowHeight) - 1);
        if (keys.onKeyDown(event, rows.count, pageRows)) return;
        const current = active.row === null ? null : rows.at(active.row);
        if (!sorting && active.move(event.key, rows.count, pageRows) !== null) event.preventDefault();
        else if (event.key === 'Enter' && current) {
            activate(current);
            event.preventDefault();
        } else if (event.key === ' ' && current && selecting) {
            keys.toggle(current);
            event.preventDefault();
        } else if (event.key === 'Delete' && !sorting) {
            mode.removeFavorites(
                selecting
                    ? mode.selectedEntries()
                    : current?.kind === 'group'
                      ? membersOf(current.group)
                      : current
                        ? [entries[current.position]]
                        : [],
            );
            event.preventDefault();
        }
    };

    // Decided per gesture, as in a playlist: a tap plays at once, a mouse click only
    // moves the cursor and the double click plays.
    const onItemClick = (event: MouseEvent, row: number, entry: FavoriteEntry) => {
        if (mode.mode === 'select') {
            keys.pick(row, () => keys.toggle(rows.at(row)));
            return;
        }
        // The sort has no cursor, and on a phone a track that is not in its playlist
        // takes none either.
        if (sorting || (!docked && !entry.located)) return;
        active.select(rows.keyAt(row));
        if (!entry.located) return;
        const { pointerType } = event.nativeEvent as PointerEvent;
        if (pointerType !== 'mouse') play(entry.located);
    };

    const rowId = (row: number) => `${listId}-${row}`;
    const widestNumber = `${'0'.repeat(Math.max(1, String(entries.length).length))}.`;
    const rowProps = {
        view: fixedRowView,
        docked,
        thumbnailSize: twoLineRowHeight - 2 * thumbnailMargin,
        widestNumber,
        selecting,
        sorting: sortable,
    };
    const itemProps = ({ record, located }: FavoriteEntry) => ({
        ...rowProps,
        item: located ?? snapshotItem(record),
        playlistId: located?.playlistId ?? record.playlistId,
        revision: located?.revision ?? 0,
    });

    let ghost = null;
    if (drag.state) {
        const row = rows.at(drag.state.source.row);
        const entry = row.kind === 'item' ? entries[row.position] : undefined;
        const style = { height: drag.state.source.ghostHeight, transform: `translateY(${drag.state.top}px)` };
        ghost = (
            <div className={clsx(styles.row, styles.ghost)} style={style}>
                {entry && row.kind === 'item' ? (
                    <ItemRow {...itemProps(entry)} number={row.position + 1} selected={false} onSelect={() => {}} />
                ) : (
                    <SkeletonRow {...rowProps} index={drag.state.source.row} />
                )}
            </div>
        );
    }

    const rowKey = useRowKeys(
        virtualRows.map(row => row.index),
        index => rows.at(index).kind,
        !drag.state,
    );

    return (
        <FastScroll scrollRef={scrollRef} label={topGroupName(rows, virtualizer)} onDragChange={setThumbDragging}>
            <section
                ref={scrollRef}
                className={clsx(styles.page, active.byKeyboard && styles.keyboard)}
                aria-label={t('screens.favorites')}
                role="listbox"
                tabIndex={0}
                aria-activedescendant={active.row === null || sorting ? undefined : rowId(active.row)}
                onKeyDown={onKeyDown}
            >
                {entries.length === 0 ? (
                    <p className={styles.message}>{t(searching ? 'playlist.noResults' : 'favorites.empty')}</p>
                ) : (
                    <div
                        className={clsx(styles.list, drag.state && !drag.settled && styles.dragging)}
                        style={{ height: virtualizer.getTotalSize() + (drag.state?.source.ghostHeight ?? 0) }}
                    >
                        {virtualRows.map(({ index, start }) => {
                            const row = rows.at(index);
                            const isActive = !sorting && active.row === index;
                            const hidden = drag.hidden(index);
                            const transform = `translateY(${start + drag.shift(index)}px)`;
                            if (row.kind === 'group')
                                return (
                                    <div
                                        key={rowKey(index)}
                                        id={rowId(index)}
                                        role="option"
                                        data-testid="group-row"
                                        aria-selected={isActive}
                                        className={clsx(
                                            styles.groupRow,
                                            isActive && styles.active,
                                            hidden && styles.hidden,
                                        )}
                                        style={{ height: groupRowHeight, transform }}
                                        onClickCapture={event => keys.onRowClick(event, index)}
                                    >
                                        {selecting && (
                                            <Checkbox
                                                variant="list"
                                                title={t('playlist.selectGroup')}
                                                tabIndex={-1}
                                                className={styles.groupCheckbox}
                                                {...groupCheckState(row.group)}
                                                onChange={event =>
                                                    keys.pick(index, () => keys.setSelected(row, event.target.checked))
                                                }
                                            />
                                        )}
                                        <GroupRow group={row.group} onToggle={() => mode.toggleGroup(row.group)} />
                                        {!selecting && (
                                            <RowMenuIcon
                                                title={t('playlist.groupActions')}
                                                menu={groupMenu.button(index, row.group)}
                                            />
                                        )}
                                    </div>
                                );
                            const entry = entries[row.position];
                            const { located } = entry;
                            return (
                                <div
                                    key={rowKey(index)}
                                    id={rowId(index)}
                                    role="option"
                                    data-testid="item-row"
                                    aria-selected={isActive}
                                    title={located ? undefined : t('favorites.missing')}
                                    className={clsx(
                                        styles.row,
                                        index % 2 && styles.odd,
                                        isActive && styles.active,
                                        !located && styles.missing,
                                        located && isPlaying(located) && styles.playing,
                                        hidden && styles.hidden,
                                    )}
                                    style={{ height: twoLineRowHeight, transform }}
                                    onClickCapture={event => keys.onRowClick(event, index)}
                                    onClick={event => onItemClick(event, index, entry)}
                                    onDoubleClick={() => located && mode.mode === null && play(located)}
                                >
                                    <ItemRow
                                        {...itemProps(entry)}
                                        number={row.position + 1}
                                        queueMark={
                                            located &&
                                            queueMark(queuePositions.get(trackKey(located.playlistId, located.index)))
                                        }
                                        selected={selecting && mode.isSelected(row.position)}
                                        onSelect={selected => keys.pick(index, () => keys.setSelected(row, selected))}
                                        onDragStart={event => drag.start(index, event)}
                                        menu={selecting ? undefined : rowMenu.button(index, entry)}
                                    />
                                </div>
                            );
                        })}
                        {ghost}
                    </div>
                )}
                {rowMenu.popover}
                {groupMenu.popover}
                {removal.dialogs}
                {download.dialogs}
            </section>
        </FastScroll>
    );
}

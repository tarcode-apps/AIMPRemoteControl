'use client';

import { usePlayer } from '@/app/_api/player';
import { queueMark, trackKey, useQueuePositions } from '@/app/_api/queue';
import type { LocatedItem, PlaylistGroup, PlaylistItem } from '@/app/_api/types';
import { ListCheckbox } from '@/app/_components/inputs';
import {
    groupPositions,
    GroupRow,
    ItemRow,
    positionsCheckState,
    SkeletonRow,
    thumbnailMargin,
    twoLineRowHeight,
    useActiveRow,
    usePlaylistDrag,
    type PlaylistRow,
    type RowView,
} from '@/app/_components/lists';
import styles from '@/app/_components/lists/ListPage.module.scss';
import { useRowMenu } from '@/app/_components/menus';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { useFavoriteRelink, useFavorites, type FavoriteRecord } from '@/app/_state/Favorites';
import { useNavigation } from '@/app/_state/Navigation';
import { useTrackActions } from '@/app/_state/useTrackActions';
import { media } from '@/app/_styles/media';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useFavoritesMode, type FavoriteEntry } from './FavoritesMode';

const groupRowHeight = 40;
const overscanRows = 6;
const view: RowView = { showNumbers: true, showThumbnails: true, showSecondLine: true, showDuration: true };

// What a row shows of a favorite that is not in its playlist: its snapshot.
function snapshotItem(record: FavoriteRecord): PlaylistItem {
    return {
        index: -1,
        displayText: record.displayText,
        secondLine: record.secondLine,
        duration: record.duration,
        size: record.size,
        rating: 0,
        enabled: true,
        isUrl: record.isUrl,
        cover: '',
        fileUri: record.fileUri,
    };
}

export function FavoritesPage() {
    const { t } = useTranslation();
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
    // eslint-disable-next-line react-hooks/incompatible-library -- the compiler skips this component, which is fine here
    const virtualizer = useVirtualizer({
        count: rows.count,
        getScrollElement: () => scrollRef.current,
        estimateSize: row =>
            collapsed.current(row) ? 0 : rows.at(row).kind === 'group' ? groupRowHeight : twoLineRowHeight,
        overscan: overscanRows,
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
            active.select({ kind: 'item', position: target });
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
    const [followedUri, setFollowedUri] = useState<string | null>(null);
    if (playingUri !== followedUri) {
        setFollowedUri(playingUri);
        const position = entries.findIndex(({ record }) => record.fileUri === playingUri);
        if (!searching && (position >= 0 || !docked)) active.select(position < 0 ? null : { kind: 'item', position });
    }

    const queuePositions = useQueuePositions();
    const rowMenu = useRowMenu(({ record, located }: FavoriteEntry) => {
        const remove = {
            label: t('favorites.remove'),
            icon: 'heart_minus',
            onSelect: () => favorites.remove([record.fileUri]),
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
            ...trackActions.enqueueItems(located),
            { ...showItem, onSelect: () => mode.leaveThen(showItem.onSelect) },
            remove,
        ];
    });

    const groupSelection = (group: PlaylistGroup) => positionsCheckState(group, mode.isSelected);
    const setGroupSelected = (group: PlaylistGroup, selected: boolean) =>
        mode.setSelected(groupPositions(group), selected, rows);
    const toggleSelected = (row: PlaylistRow) => {
        if (row.kind === 'group') setGroupSelected(row.group, !groupSelection(row.group).checked);
        else mode.setSelected([row.position], !mode.isSelected(row.position), rows);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (rows.count === 0) return;
        const pageRows = Math.max(1, Math.floor(event.currentTarget.clientHeight / twoLineRowHeight) - 1);
        const current = active.row === null ? null : rows.at(active.row);
        if ((docked || !sorting) && active.move(event.key, rows.count, pageRows)) event.preventDefault();
        else if (event.key === 'Enter' && current) {
            if (current.kind === 'group') mode.toggleGroup(current.group);
            else {
                const located = entries[current.position]?.located;
                if (located && !sorting) play(located);
            }
            event.preventDefault();
        } else if (event.key === ' ' && current && selecting) {
            toggleSelected(current);
            event.preventDefault();
        }
    };

    // Decided per gesture, as in a playlist: a tap plays at once, a mouse click only
    // moves the cursor and the double click plays.
    const onItemClick = (event: MouseEvent, row: number, position: number, entry: FavoriteEntry) => {
        if (mode.mode === 'select') {
            mode.setSelected([position], !mode.isSelected(position), rows);
            return;
        }
        // On a phone, while sorting the cursor stays where the last drag put it, and
        // a track that is not in its playlist takes no cursor.
        if (!docked && (sorting || !entry.located)) return;
        active.select(rows.keyAt(row));
        if (sorting || !entry.located) return;
        const { pointerType } = event.nativeEvent as PointerEvent;
        if (pointerType !== 'mouse') play(entry.located);
    };

    const rowId = (row: number) => `${listId}-${row}`;
    const widestNumber = `${'0'.repeat(Math.max(1, String(entries.length).length))}.`;
    const rowProps = {
        view,
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
                    <SkeletonRow {...rowProps} />
                )}
            </div>
        );
    }

    return (
        <section
            ref={scrollRef}
            className={clsx(styles.page, active.byKeyboard && styles.keyboard)}
            aria-label={t('screens.favorites')}
            role="listbox"
            tabIndex={0}
            aria-activedescendant={active.row === null ? undefined : rowId(active.row)}
            onKeyDown={onKeyDown}
            // Word selection starts on the second press of a double click.
            onMouseDown={event => {
                if (event.detail > 1) event.preventDefault();
            }}
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
                                            onChange={event => setGroupSelected(row.group, event.target.checked)}
                                        />
                                    )}
                                    <GroupRow group={row.group} onToggle={() => mode.toggleGroup(row.group)} />
                                </div>
                            );
                        const entry = entries[row.position];
                        const { located } = entry;
                        return (
                            <div
                                key={index}
                                id={rowId(index)}
                                role="option"
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
                                onClick={event => onItemClick(event, index, row.position, entry)}
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
                                    onSelect={selected => mode.setSelected([row.position], selected, rows)}
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
        </section>
    );
}

'use client';

import { errorMessage } from '@/app/_api/helpers/errors';
import { usePlayer } from '@/app/_api/player';
import { queueMark, trackKey, useEnqueue, useQueuePositions } from '@/app/_api/queue';
import { useSearchPages } from '@/app/_api/search';
import type { PlaylistGroup, SearchHit } from '@/app/_api/types';
import { Checkbox } from '@/app/_components/inputs';
import {
    fixedRowView,
    GroupRow,
    groupRowHeight,
    ItemRow,
    overscanRows,
    pageRange,
    pagesAround,
    pageSize,
    RowMenuIcon,
    SkeletonRow,
    thumbnailMargin,
    twoLineRowHeight,
    useActiveRow,
    useFoldingItems,
    useRowKeys,
    useSearchKeys,
    useSelectionKeys,
    type PlaylistRow,
    type PlaylistRowKey,
} from '@/app/_components/lists';
import styles from '@/app/_components/lists/ListPage.module.scss';
import { menuSeparator, useRowMenu } from '@/app/_components/menus';
import { useItemRemoval } from '@/app/_components/playlists';
import { useErrorToast } from '@/app/_components/toast';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { useOnChange } from '@/app/_hooks/useOnChange';
import { useFavoriteRelink } from '@/app/_state/Favorites';
import { useNavigation } from '@/app/_state/Navigation';
import { useFavoriteActions } from '@/app/_state/useFavoriteActions';
import { useTrackActions } from '@/app/_state/useTrackActions';
import { media } from '@/app/_styles/media';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchMode } from './SearchMode';

const pendingRows = 12;

export function SearchPage() {
    const { t } = useTranslation();
    const showError = useErrorToast();
    const docked = useMediaQuery(media.drawerDocked);
    const scrollRef = useRef<HTMLDivElement>(null);
    const listId = useId();
    const mode = useSearchMode();
    const { rows, params, selecting } = mode;

    // eslint-disable-next-line react-hooks/incompatible-library -- the compiler skips this component, which is fine here
    const virtualizer = useVirtualizer({
        count: rows.count,
        getScrollElement: () => scrollRef.current,
        estimateSize: row => (rows.at(row).kind === 'group' ? groupRowHeight : twoLineRowHeight),
        overscan: overscanRows,
    });
    const active = useActiveRow(rows, row => virtualizer.scrollToIndex(row, { align: 'auto' }));
    const virtualRows = virtualizer.getVirtualItems();
    const rowKey = useRowKeys(
        virtualRows.map(row => row.index),
        index => rows.at(index).kind,
    );
    const first = virtualRows.at(0)?.index;
    const last = virtualRows.at(-1)?.index;
    const pages = pagesAround(
        first === undefined || last === undefined ? null : rows.positions(first, last),
        rows.itemCount,
    );
    const queries = useSearchPages(params, pages.map(pageRange));
    // Read from the queries themselves rather than the cache: a query only
    // re-renders the page for the fields the page reads.
    const loaded = new Map(queries.flatMap((query, i) => (query.data ? [[pages[i], query.data] as const] : [])));
    const failed = queries.find(query => query.isError && !query.data);
    const hitAt = (position: number) => {
        const page = loaded.get(Math.floor(position / pageSize));
        return page?.items[position % pageSize];
    };
    // Sizes are cached by index, and folding a group changes which indexes are headers.
    useLayoutEffect(() => virtualizer.measure(), [rows, virtualizer]);

    const { goBack } = useNavigation();
    const trackActions = useTrackActions();
    const play = trackActions.play;
    const { data: player } = usePlayer();
    const playing = player?.track;
    const isPlaying = (hit: SearchHit) => playing?.playlistId === hit.playlistId && playing.index === hit.index;

    // The cursor follows the track, as in a playlist: on a mobile it is the track's
    // alone, docked a track outside the results leaves it be. Where the track is in
    // the results is known only once its page has loaded, so the cursor waits for
    // that, which may be when the user scrolls that far.
    const playingKey = playing ? `${playing.playlistId}|${playing.index}` : null;
    const [followsTrack, setFollowsTrack] = useState(playingKey !== null);
    useOnChange(playingKey, () => {
        setFollowsTrack(playingKey !== null);
        if (!docked) active.select(null);
    });
    // The positions are the result's: the cursor goes with a change of the search,
    // and finds the playing track again among the new hits.
    useOnChange(JSON.stringify(params), () => {
        active.select(null);
        setFollowsTrack(playingKey !== null);
    });
    if (followsTrack && playing) {
        for (const [page, data] of loaded) {
            const at = data.items.findIndex(hit => isPlaying(hit) && hit.revision === playing.playlistRevision);
            if (at < 0) continue;
            setFollowsTrack(false);
            active.select({ kind: 'item', position: page * pageSize + at });
            break;
        }
    }
    // A cursor moved by hand is the user's, not the playing track's any more.
    const cursor = {
        ...active,
        select: (key: PlaylistRowKey | null) => {
            setFollowsTrack(false);
            active.select(key);
        },
        move: (eventKey: string, count: number, pageRows: number) => {
            setFollowsTrack(false);
            return active.move(eventKey, count, pageRows);
        },
    };

    // As a picker for a favorite that lost its track, the screen hands the chosen
    // track to the record and goes back.
    const { relinking, finishRelink } = useFavoriteRelink();
    const favoriteActions = useFavoriteActions();
    // A failure leaves the picker open, to try another track or go back.
    const relinkTo = async (hit: SearchHit) => {
        if (!relinking) return;
        try {
            await favoriteActions.relink(relinking, hit);
        } catch (error) {
            showError(error);
            return;
        }
        finishRelink();
        goBack();
    };

    const queuePositions = useQueuePositions();
    const removal = useItemRemoval();
    const rowMenu = useRowMenu((hit: SearchHit) => [
        ...trackActions.enqueueItems(hit),
        trackActions.showItem(hit),
        favoriteActions.favoriteMenuItem(hit),
        menuSeparator,
        ...removal.trackItems({ ...hit, name: hit.displayText }),
    ]);

    // As a playlist's, over the group's hits. Picking a track for a favorite
    // leaves only the folding.
    const enqueue = useEnqueue();
    const foldingItems = useFoldingItems();
    const groupMenu = useRowMenu((group: PlaylistGroup) => {
        const folding = foldingItems(group, { toggle: mode.toggleGroup, setAll: mode.setAllExpanded });
        if (relinking) return folding;
        const enqueueGroup = (atBeginning: boolean) => {
            const selection = mode.groupSelection(group);
            if (selection) enqueue.mutate({ ...selection, atBeginning }, { onError: showError });
        };
        return [
            {
                label: t('playlist.enqueue'),
                icon: 'playlist_add',
                onSelect: () => enqueueGroup(false),
            },
            {
                label: t('playlist.enqueueFirst'),
                icon: 'playlist_play',
                onSelect: () => enqueueGroup(true),
            },
            {
                label: t('favorites.add'),
                icon: 'heart_plus',
                onSelect: () => {
                    const selection = mode.groupSelection(group);
                    if (selection) void favoriteActions.addSelection(selection).catch(showError);
                },
            },
            menuSeparator,
            ...folding,
            menuSeparator,
            ...removal.selectionItems(() => mode.groupSelection(group)),
        ];
    });

    // The results are always in groups, one per playlist, which a row goes with.
    const keys = useSelectionKeys({ mode, rows, active: cursor, list: scrollRef, disabled: relinking !== null });
    // Enter: a header folds, a hit plays, or takes the favorite's place.
    const activate = (row: PlaylistRow) => {
        if (row.kind === 'group') mode.toggleGroup(row.group);
        else {
            const hit = hitAt(row.position);
            if (hit && relinking) void relinkTo(hit);
            else if (hit) play(hit);
        }
    };
    useSearchKeys({ mode, rows, active: cursor, list: scrollRef, onEnter: activate });
    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (rows.count === 0) return;
        const pageRows = Math.max(1, Math.floor(event.currentTarget.clientHeight / twoLineRowHeight) - 1);
        if (keys.onKeyDown(event, rows.count, pageRows)) return;
        const current = active.row === null ? null : rows.at(active.row);
        if (cursor.move(event.key, rows.count, pageRows) !== null) event.preventDefault();
        else if (event.key === 'Enter' && current) {
            activate(current);
            event.preventDefault();
        } else if (event.key === ' ' && current && selecting) {
            keys.toggle(current);
            event.preventDefault();
        } else if (event.key === 'Delete' && !relinking) {
            const hit = current?.kind === 'item' ? hitAt(current.position) : undefined;
            if (selecting) removal.removeSelection(mode.itemsSelection);
            else if (current?.kind === 'group') removal.removeSelection(mode.groupSelection(current.group));
            else if (hit) removal.removeTrack({ ...hit, name: hit.displayText });
            event.preventDefault();
        }
    };

    // Decided per gesture, as in a playlist: a tap plays at once, a mouse click only
    // moves the cursor and the double click plays.
    const onItemClick = (event: MouseEvent, row: number, hit: SearchHit) => {
        if (selecting) {
            keys.pick(row, () => keys.toggle(rows.at(row)));
            return;
        }
        if (relinking) {
            void relinkTo(hit);
            return;
        }
        cursor.select(rows.keyAt(row));
        const { pointerType } = event.nativeEvent as PointerEvent;
        if (pointerType !== 'mouse') play(hit);
    };

    const rowId = (row: number) => `${listId}-${row}`;
    const widestNumber = `${'0'.repeat(
        Math.max(
            1,
            ...virtualRows.map(virtualRow => {
                const row = rows.at(virtualRow.index);
                const hit = row.kind === 'item' ? hitAt(row.position) : undefined;
                return hit ? String(hit.index + 1).length : 0;
            }),
        ),
    )}.`;
    const rowProps = {
        view: fixedRowView,
        docked,
        thumbnailSize: twoLineRowHeight - 2 * thumbnailMargin,
        widestNumber,
        selecting,
        sorting: false,
    };

    let content;
    if (!params) content = <p className={styles.message}>{t('search.prompt')}</p>;
    else if (mode.error || failed) {
        const error = mode.error ?? failed?.error;
        content = (
            <div className={styles.message}>
                <p>{errorMessage(error, t)}</p>
                <button className={styles.retry} onClick={() => (mode.error ? mode.refetch() : failed?.refetch())}>
                    {t('actions.retry')}
                </button>
            </div>
        );
    } else if (mode.pending)
        content = (
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
        );
    else if (rows.count === 0) content = <p className={styles.message}>{t('playlist.noResults')}</p>;
    else
        content = (
            <div className={styles.list} style={{ height: virtualizer.getTotalSize() }}>
                {virtualRows.map(({ index, start }) => {
                    const row = rows.at(index);
                    const isActive = active.row === index;
                    const transform = `translateY(${start}px)`;
                    if (row.kind === 'group')
                        return (
                            <div
                                key={rowKey(index)}
                                id={rowId(index)}
                                role="option"
                                data-testid="group-row"
                                aria-selected={isActive}
                                className={clsx(styles.groupRow, isActive && styles.active)}
                                style={{ height: groupRowHeight, transform }}
                                onClickCapture={event => keys.onRowClick(event, index)}
                            >
                                {selecting && (
                                    <Checkbox
                                        variant="list"
                                        title={t('playlist.selectGroup')}
                                        tabIndex={-1}
                                        className={styles.groupCheckbox}
                                        {...mode.groupCheckState(row.group.index)}
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
                    const hit = hitAt(row.position);
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
                                hit && isPlaying(hit) && styles.playing,
                            )}
                            style={{ height: twoLineRowHeight, transform }}
                            onClickCapture={event => keys.onRowClick(event, index)}
                            onClick={event => hit && onItemClick(event, index, hit)}
                            onDoubleClick={() => hit && !selecting && !relinking && play(hit)}
                        >
                            {hit ? (
                                <ItemRow
                                    {...rowProps}
                                    item={hit}
                                    playlistId={hit.playlistId}
                                    revision={hit.revision}
                                    number={hit.index + 1}
                                    queueMark={queueMark(queuePositions.get(trackKey(hit.playlistId, hit.index)))}
                                    selected={selecting && mode.isSelected(row.position, row.group?.index)}
                                    onSelect={selected => keys.pick(index, () => keys.setSelected(row, selected))}
                                    menu={selecting || relinking ? undefined : rowMenu.button(index, hit)}
                                />
                            ) : (
                                <SkeletonRow {...rowProps} index={index} />
                            )}
                        </div>
                    );
                })}
            </div>
        );

    return (
        <section
            ref={scrollRef}
            className={clsx(styles.page, active.byKeyboard && styles.keyboard)}
            aria-label={t('search.title')}
            role="listbox"
            tabIndex={0}
            aria-activedescendant={active.row === null ? undefined : rowId(active.row)}
            onKeyDown={onKeyDown}
        >
            {content}
            {rowMenu.popover}
            {groupMenu.popover}
            {removal.dialogs}
        </section>
    );
}

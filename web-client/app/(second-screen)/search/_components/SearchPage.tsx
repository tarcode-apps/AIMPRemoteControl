'use client';

import { errorMessage } from '@/app/_api/helpers/errors';
import { usePlayer } from '@/app/_api/player';
import { queueMark, trackKey, useQueuePositions } from '@/app/_api/queue';
import { useSearchPages } from '@/app/_api/search';
import type { PlaylistGroup, SearchHit } from '@/app/_api/types';
import { ListCheckbox } from '@/app/_components/inputs';
import {
    GroupRow,
    ItemRow,
    pageRange,
    pagesAround,
    pageSize,
    SkeletonRow,
    thumbnailMargin,
    twoLineRowHeight,
    useActiveRow,
    type PlaylistRow,
    type RowView,
} from '@/app/_components/lists';
import styles from '@/app/_components/lists/ListPage.module.scss';
import { useRowMenu } from '@/app/_components/menus';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { useFavoriteRelink } from '@/app/_state/Favorites';
import { useNavigation } from '@/app/_state/Navigation';
import { useFavoriteActions } from '@/app/_state/useFavoriteActions';
import { useTrackActions } from '@/app/_state/useTrackActions';
import { media } from '@/app/_styles/media';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { useId, useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchMode } from './SearchMode';

const groupRowHeight = 40;
const overscanRows = 6;
const pendingRows = 12;
const view: RowView = { showNumbers: true, showThumbnails: true, showSecondLine: true, showDuration: true };

export function SearchPage() {
    const { t } = useTranslation();
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

    // As a picker for a favorite that lost its track, the screen hands the chosen
    // track to the record and goes back.
    const { relinking, finishRelink } = useFavoriteRelink();
    const favoriteActions = useFavoriteActions();
    const relinkTo = async (hit: SearchHit) => {
        if (!relinking) return;
        await favoriteActions.relink(relinking, hit);
        finishRelink();
        goBack();
    };

    const queuePositions = useQueuePositions();
    const rowMenu = useRowMenu((hit: SearchHit) => [
        ...trackActions.enqueueItems(hit),
        trackActions.showItem(hit),
        favoriteActions.favoriteMenuItem(hit),
    ]);

    // The results are always in groups, one per playlist, which a row goes with.
    const toggleRow = (position: number, group: PlaylistGroup | undefined) =>
        mode.setSelected([position], !mode.isSelected(position, group?.index), rows, group);
    const toggleSelected = (row: PlaylistRow) => {
        if (row.kind === 'group')
            mode.setGroupSelected(row.group.index, !mode.groupCheckState(row.group.index).checked, rows);
        // A row still loading has no hit to keep, so it cannot be picked yet.
        else if (hitAt(row.position)) toggleRow(row.position, row.group);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (rows.count === 0) return;
        const pageRows = Math.max(1, Math.floor(event.currentTarget.clientHeight / twoLineRowHeight) - 1);
        const current = active.row === null ? null : rows.at(active.row);
        if (active.move(event.key, rows.count, pageRows)) event.preventDefault();
        else if (event.key === 'Enter' && current) {
            if (current.kind === 'group') mode.toggleGroup(current.group);
            else {
                const hit = hitAt(current.position);
                if (hit && relinking) void relinkTo(hit);
                else if (hit) play(hit);
            }
            event.preventDefault();
        } else if (event.key === ' ' && current && selecting) {
            toggleSelected(current);
            event.preventDefault();
        }
    };

    // Decided per gesture, as in a playlist: a tap plays at once, a mouse click only
    // moves the cursor and the double click plays.
    const onItemClick = (event: MouseEvent, row: number, position: number, hit: SearchHit) => {
        if (selecting) {
            toggleRow(position, rows.at(row).group);
            return;
        }
        if (relinking) {
            void relinkTo(hit);
            return;
        }
        active.select(rows.keyAt(row));
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
        view,
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
                        <SkeletonRow {...rowProps} />
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
                                key={index}
                                id={rowId(index)}
                                role="option"
                                aria-selected={isActive}
                                className={clsx(styles.groupRow, isActive && styles.active)}
                                style={{ height: groupRowHeight, transform }}
                            >
                                {selecting && (
                                    <ListCheckbox
                                        title={t('playlist.selectGroup')}
                                        tabIndex={-1}
                                        className={styles.groupCheckbox}
                                        {...mode.groupCheckState(row.group.index)}
                                        onChange={event =>
                                            mode.setGroupSelected(row.group.index, event.target.checked, rows)
                                        }
                                    />
                                )}
                                <GroupRow group={row.group} onToggle={() => mode.toggleGroup(row.group)} />
                            </div>
                        );
                    const hit = hitAt(row.position);
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
                                hit && isPlaying(hit) && styles.playing,
                            )}
                            style={{ height: twoLineRowHeight, transform }}
                            onClick={event => hit && onItemClick(event, index, row.position, hit)}
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
                                    onSelect={selected => mode.setSelected([row.position], selected, rows, row.group)}
                                    menu={selecting || relinking ? undefined : rowMenu.button(index, hit)}
                                />
                            ) : (
                                <SkeletonRow {...rowProps} />
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
            // Word selection starts on the second press of a double click.
            onMouseDown={event => {
                if (event.detail > 1) event.preventDefault();
            }}
        >
            {content}
            {rowMenu.popover}
        </section>
    );
}

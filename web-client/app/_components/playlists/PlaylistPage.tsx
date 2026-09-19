'use client';

import { errorMessage } from '@/app/_api/errors';
import { usePlaylistItems, useSetGroupExpanded } from '@/app/_api/playlists';
import type { Playlist, PlaylistGroup, PlaylistItem } from '@/app/_api/types';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { media } from '@/app/_styles/media';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { useId, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '../inputs';
import styles from './PlaylistPage.module.scss';
import { GroupRow, ItemRow, SkeletonRow } from './PlaylistRowContent';
import type { PlaylistRow } from './playlistRows';
import { usePlaylistSearch } from './PlaylistSearch';
import { usePlaylistSelection } from './PlaylistSelection';
import { useActiveRow } from './useActiveRow';
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
    const search = usePlaylistSearch();
    // The pager keeps the neighbouring playlists mounted with their plain lists.
    const mine = selected?.id === playlist.id;
    const text = mine ? search.text : '';
    const searching = text !== '';
    const selecting = mine && search.active;
    const itemRowHeight = playlist.showSecondLine ? twoLineRowHeight : oneLineRowHeight;

    const layout = usePlaylistLayout(playlist, text);
    const { rows } = layout;
    const setExpanded = useSetGroupExpanded(playlist.id);

    // eslint-disable-next-line react-hooks/incompatible-library -- the compiler skips this component, which is fine here
    const virtualizer = useVirtualizer({
        count: rows.count,
        getScrollElement: () => scrollRef.current,
        estimateSize: row => (rows.at(row).kind === 'group' ? groupRowHeight : itemRowHeight),
        overscan: overscanRows,
    });
    const active = useActiveRow(row => virtualizer.scrollToIndex(row, { align: 'auto' }));
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
            if (search.isSelected(item.index)) selectedCount++;
        }
        const checked = loadedCount === group.count && selectedCount === loadedCount && loadedCount > 0;
        return { checked, indeterminate: !checked && selectedCount > 0 };
    };

    const play = (item: PlaylistItem) => console.log('PLAY', item.index);

    const toggleGroup = (group: PlaylistGroup) => {
        if (!searching)
            setExpanded.mutate({ index: group.index, expanded: !group.expanded, revision: playlist.revision });
    };

    const toggleSelected = (row: PlaylistRow, item: PlaylistItem | undefined) => {
        if (row.kind === 'group')
            void search.setRangeSelected(row.group.firstPosition, row.group.count, !groupSelection(row.group).checked);
        else if (item) search.setSelected([item.index], !search.isSelected(item.index));
    };

    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (rows.count === 0) return;
        const pageRows = Math.max(1, Math.floor(event.currentTarget.clientHeight / itemRowHeight) - 1);
        const current = active.row === null ? null : rows.at(active.row);
        const item = current?.kind === 'item' ? itemAt(current.position) : undefined;
        if (active.move(event.key, rows.count, pageRows)) event.preventDefault();
        else if (event.key === 'Enter' && current) {
            if (current.kind === 'group') toggleGroup(current.group);
            else if (item) play(item);
            event.preventDefault();
        } else if (event.key === ' ' && current && selecting) {
            toggleSelected(current, item);
            event.preventDefault();
        }
    };

    const onItemClick = (event: MouseEvent, row: number, item: PlaylistItem) => {
        if (search.selecting) {
            search.setSelected([item.index], !search.isSelected(item.index));
            return;
        }
        active.select(row);
        // Decided per gesture rather than per device: a tap plays at once, a mouse
        // click only selects and the double click plays.
        const { pointerType } = event.nativeEvent as PointerEvent;
        if (searching || pointerType !== 'mouse') play(item);
    };

    const rowId = (row: number) => `${listId}-${row}`;
    const rowProps = { playlist, docked, widestNumber, selecting };

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
                <div className={styles.list} style={{ height: virtualizer.getTotalSize() }}>
                    {virtualRows.map(({ index, start }) => {
                        const row = rows.at(index);
                        const isActive = active.row === index;
                        if (row.kind === 'group')
                            return (
                                <div
                                    key={index}
                                    id={rowId(index)}
                                    role="option"
                                    aria-selected={isActive}
                                    className={clsx(styles.groupRow, isActive && styles.active)}
                                    style={{ height: groupRowHeight, transform: `translateY(${start}px)` }}
                                    onClick={() => active.select(index)}
                                >
                                    {selecting && (
                                        <Checkbox
                                            title={t('playlist.selectGroup')}
                                            tabIndex={-1}
                                            className={styles.groupCheckbox}
                                            {...groupSelection(row.group)}
                                            onChange={event =>
                                                search.setRangeSelected(
                                                    row.group.firstPosition,
                                                    row.group.count,
                                                    event.target.checked,
                                                )
                                            }
                                        />
                                    )}
                                    <GroupRow
                                        group={row.group}
                                        onToggle={searching ? undefined : () => toggleGroup(row.group)}
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
                                className={clsx(styles.row, index % 2 && styles.odd, isActive && styles.active)}
                                style={{ height: itemRowHeight, transform: `translateY(${start}px)` }}
                                onClick={event => item && onItemClick(event, index, item)}
                                onDoubleClick={() => item && !search.selecting && !searching && play(item)}
                            >
                                {item ? (
                                    <ItemRow
                                        {...rowProps}
                                        item={item}
                                        number={numberOf(row, item) ?? 0}
                                        selected={selecting && search.isSelected(item.index)}
                                        onSelect={selected => search.setSelected([item.index], selected)}
                                    />
                                ) : (
                                    <SkeletonRow {...rowProps} />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

'use client';

import { errorMessage } from '@/app/_api/helpers/errors';
import { useSetItemsEnabled } from '@/app/_api/items';
import { usePlayer, usePlayTrack } from '@/app/_api/player';
import {
    useMovePlaylistItems,
    usePlaylistItems,
    useSetGroupExpanded,
    useSetItemEnabled,
    useSetItemMark,
} from '@/app/_api/playlists';
import { queueMark, trackKey, useEnqueue, useQueuePositions } from '@/app/_api/queue';
import type {
    ItemsSelection,
    Playlist,
    PlaylistGroup,
    PlaylistItem,
    UploadFile,
    UploadPlacement,
} from '@/app/_api/types';
import { Icon } from '@/app/_components/icons';
import { Checkbox } from '@/app/_components/inputs';
import type { PlaylistRow } from '@/app/_components/lists';
import {
    DragHandle,
    FastScroll,
    groupRange,
    GroupRow,
    groupRowHeight,
    ItemRow,
    oneLineRowHeight,
    overscanRows,
    pageRange,
    pagesAround,
    pageSize,
    RowMenuIcon,
    SkeletonRow,
    Switch,
    thumbnailMargin,
    topGroupName,
    twoLineRowHeight,
    useActiveRow,
    useFoldingItems,
    usePlaylistDrag,
    useRowKeys,
    useSearchKeys,
    useSelectionKeys,
} from '@/app/_components/lists';
import styles from '@/app/_components/lists/ListPage.module.scss';
import { MenuPopover, menuSeparator, useRowMenu, type MenuEntry } from '@/app/_components/menus';
import { useFileUpload, useItemRemoval, useTrackDownload } from '@/app/_components/playlists';
import { useErrorToast } from '@/app/_components/toast';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { useOnChange } from '@/app/_hooks/useOnChange';
import { hasFiles, useFileDrag } from '@/app/_state/FileDrag';
import { usePlaylistSelection } from '@/app/_state/PlaylistSelection';
import { useFavoriteActions } from '@/app/_state/useFavoriteActions';
import { useTrackActions } from '@/app/_state/useTrackActions';
import { media } from '@/app/_styles/media';
import { anchorName } from '@/app/_utils/anchorName';
import { readDroppedFiles, totalSize } from '@/app/_utils/droppedFiles';
import { formatSize } from '@/app/_utils/format';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import {
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type DragEvent,
    type KeyboardEvent,
    type MouseEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaylistMode } from './PlaylistMode';
import { usePlaylistLayout } from './usePlaylistLayout';

const pendingRows = 12;
const noFolding: ReadonlyMap<number, boolean> = new Map();
// Where each playlist's list was scrolled to when it last left the screen: the
// pager keeps only the neighbouring playlists mounted, and a docked drawer shows
// one at a time.
const scrollOffsets = new Map<string, number>();
// Files held this close to an edge scroll the list, the faster the closer.
const dropEdge = 48;
const dropScrollStep = 24;
// The line before the first row lies this far down, so that the list's top edge
// does not cut its circle.
const dropLineInset = 5;

// Files dropped on the list, until the user says where they go: `index` is the
// place the line showed, null where none could be told, as in a search without
// matches.
type DropMenu = {
    offset: number;
    index: number | null;
    files: UploadFile[] | null;
};

export type PlaylistPageProps = {
    playlist: Playlist;
};

export function PlaylistPage({ playlist }: PlaylistPageProps) {
    const { t, i18n } = useTranslation();
    const showError = useErrorToast();
    const docked = useMediaQuery(media.drawerDocked);
    const scrollRef = useRef<HTMLDivElement>(null);
    const listId = useId();
    const { selected, focus, clearFocus } = usePlaylistSelection();
    const mode = usePlaylistMode();
    // The pager keeps the neighbouring playlists mounted with their plain lists.
    const mine = selected?.id === playlist.id;
    const text = mine ? mode.text : '';
    const searching = text !== '';
    const selecting = mine && mode.selecting;
    const sorting = mine && mode.mode === 'sort';
    const sortable = sorting && !playlist.readOnly;
    const itemRowHeight = playlist.showSecondLine ? twoLineRowHeight : oneLineRowHeight;

    // While selecting, groups fold on the page alone, by index at the playlist's
    // revision: folding them in the player changes the revision, which clears the
    // selection.
    const foldingHere = mine && mode.mode === 'select';
    const [folded, setFolded] = useState({ revision: playlist.revision, groups: noFolding });
    const folding = foldingHere && folded.revision === playlist.revision ? folded.groups : noFolding;
    if (folding !== folded.groups) setFolded({ revision: playlist.revision, groups: noFolding });
    const layout = usePlaylistLayout(playlist, text, searching || sorting, folding);
    const { rows } = layout;
    const setExpanded = useSetGroupExpanded(playlist.id);
    const moveItems = useMovePlaylistItems(playlist.id);

    // Filled in by the drag hook below, which needs the virtualizer first.
    const collapsed = useRef<(row: number) => boolean>(() => false);
    const [thumbDragging, setThumbDragging] = useState(false);
    // eslint-disable-next-line react-hooks/incompatible-library -- the compiler skips this component, which is fine here
    const virtualizer = useVirtualizer({
        count: rows.count,
        getScrollElement: () => scrollRef.current,
        estimateSize: row =>
            collapsed.current(row) ? 0 : rows.at(row).kind === 'group' ? groupRowHeight : itemRowHeight,
        overscan: thumbDragging ? 0 : overscanRows,
    });
    const active = useActiveRow(rows, row => virtualizer.scrollToIndex(row, { align: 'auto' }));
    const virtualRows = virtualizer.getVirtualItems();

    // Back where the list was left, once it has its size; a search scrolls through
    // other rows, so its offsets are not kept.
    const [restoring, setRestoring] = useState(() => scrollOffsets.has(playlist.id));
    const scrollOffset = virtualizer.scrollOffset ?? 0;
    useEffect(() => {
        if (!restoring || layout.pending) return;
        virtualizer.scrollToOffset(scrollOffsets.get(playlist.id) ?? 0);
        setRestoring(false);
    }, [restoring, layout.pending, virtualizer, playlist.id]);
    useEffect(() => {
        if (!restoring && !searching) scrollOffsets.set(playlist.id, scrollOffset);
    }, [restoring, searching, playlist.id, scrollOffset]);

    // Another screen asked for a track: the cursor goes to it once the rows are the
    // playlist's own, any list mode being left first. The request stays until
    // the row is in view: the rendered rows reach past the edges, and a scroll
    // asked for before the list has its size goes nowhere.
    const viewHeight = virtualizer.scrollRect?.height ?? 0;
    useEffect(() => {
        if (!focus || focus.playlistId !== playlist.id || !mine) return;
        if (mode.mode !== null) {
            mode.setMode(null);
            return;
        }
        if (layout.pending) return;
        const row = rows.rowOf({ kind: 'item', position: focus.index });
        if (row !== null) {
            const shown = virtualRows.find(virtualRow => virtualRow.index === row);
            if (!shown || shown.start < scrollOffset - 1 || shown.end > scrollOffset + viewHeight + 1) {
                virtualizer.scrollToIndex(row, { align: 'center' });
                return;
            }
            active.select({ kind: 'item', position: focus.index });
        }
        clearFocus();
    }, [
        focus,
        playlist.id,
        mine,
        mode,
        layout.pending,
        rows,
        virtualRows,
        virtualizer,
        active,
        clearFocus,
        scrollOffset,
        viewHeight,
    ]);
    const first = virtualRows.at(0)?.index;
    const last = virtualRows.at(-1)?.index;
    const pages = pagesAround(
        first === undefined || last === undefined ? null : rows.positions(first, last),
        rows.itemCount,
    );
    const queries = usePlaylistItems(
        playlist.id,
        pages.map(page => ({ ...pageRange(page), search: text })),
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
            moveItems.mutate(
                { indexes, target, revision: playlist.revision },
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
    // Sizes are cached by index: a moved group changes which indexes are headers, and
    // a drag collapses a block.
    const dragged = drag.state?.source;
    useLayoutEffect(() => virtualizer.measure(), [rows, virtualizer, dragged, itemRowHeight]);

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

    const playTrack = usePlayTrack();
    const play = (item: PlaylistItem) =>
        playTrack.mutate(
            { playlistId: playlist.id, index: item.index, revision: playlist.revision },
            { onError: showError },
        );
    // The stars are too small for a finger; a phone rates in the player.
    const setMark = useSetItemMark();
    const onRate = docked
        ? (item: PlaylistItem, mark: number) =>
              setMark.mutate({ playlistId: playlist.id, index: item.index, mark }, { onError: showError })
        : undefined;
    // The switches exist only while the playlist shows its column: hidden, the
    // player plays every track. Docked, the column is in the rows; a mobile
    // switches from the menu.
    const switches = playlist.showSwitches;
    const setItemEnabled = useSetItemEnabled();
    const setItemsEnabled = useSetItemsEnabled();
    const onSwitch = docked
        ? (item: PlaylistItem, enabled: boolean) =>
              setItemEnabled.mutate({ playlistId: playlist.id, index: item.index, enabled }, { onError: showError })
        : undefined;
    const switchMenuItem = (item: PlaylistItem) => ({
        // The icon shows the switch as it is, the label what the item does to it.
        label: t(item.enabled ? 'playlist.disable' : 'playlist.enable'),
        icon: item.enabled ? 'check_box' : 'check_box_outline_blank',
        onSelect: () =>
            setItemEnabled.mutate(
                { playlistId: playlist.id, index: item.index, enabled: !item.enabled },
                { onError: showError },
            ),
    });
    const switchGroup = (group: PlaylistGroup, enabled: boolean) =>
        setItemsEnabled.mutate({ ...groupSelection(group), enabled }, { onError: showError });
    const { data: player } = usePlayer();
    const playingTrack = player?.track;
    // The index is only valid for the revision it was read at, and the snapshot and
    // the list catch up with a change one after the other: while their revisions
    // differ the last index stays in use, or the highlight would blink. The active
    // row follows the track, as in the player, except in a search, which lists
    // other positions. On a phone the cursor is the track's alone: it goes away
    // when the track plays elsewhere, and sorting keeps the user from moving it.
    // Docked, the user moves it freely and a track elsewhere leaves it be.
    const [lastIndex, setLastIndex] = useState<number | null>(null);
    const matchedIndex =
        playingTrack?.playlistId === playlist.id
            ? playingTrack.playlistRevision === playlist.revision
                ? playingTrack.index
                : undefined
            : null;
    const playingIndex = matchedIndex === undefined ? lastIndex : matchedIndex;
    if (playingIndex !== lastIndex) {
        setLastIndex(playingIndex);
        if (!searching && (playingIndex !== null || !docked))
            active.select(playingIndex === null ? null : { kind: 'item', position: playingIndex });
    }
    // The positions are the search's: the cursor goes with a change of the text,
    // back to the playing track once the whole list is shown.
    useOnChange(text, () =>
        active.select(!searching && playingIndex !== null ? { kind: 'item', position: playingIndex } : null),
    );

    const toggleGroup = (group: PlaylistGroup) => {
        if (searching || sorting) return;
        if (foldingHere)
            setFolded({ revision: playlist.revision, groups: new Map(folding).set(group.index, !group.expanded) });
        else
            setExpanded.mutate(
                { index: group.index, expanded: !group.expanded, revision: playlist.revision },
                { onError: showError },
            );
    };

    const queuePositions = useQueuePositions();
    const hasMenu = mode.mode === null || searching;
    const trackActions = useTrackActions();
    const favoriteActions = useFavoriteActions();
    const removal = useItemRemoval();
    const download = useTrackDownload();
    const trackOf = (item: PlaylistItem) => ({
        ...item,
        playlistId: playlist.id,
        revision: playlist.revision,
        name: item.displayText,
    });
    const rowMenu = useRowMenu((item: PlaylistItem) => {
        const track = trackOf(item);
        return [
            trackActions.infoItem({ playlistId: playlist.id, fileUri: item.fileUri }),
            ...trackActions.enqueueItems(track),
            favoriteActions.favoriteMenuItem(track),
            ...(switches && !docked ? [switchMenuItem(item)] : []),
            menuSeparator,
            ...removal.trackItems(track),
            ...download.trackItems(track),
        ];
    });
    // A group's items as a selection: in a search, the matches among them.
    const groupSelection = (group: PlaylistGroup): ItemsSelection => ({
        search: text || undefined,
        playlists: [{ playlistId: playlist.id, revision: playlist.revision, ranges: [groupRange(group)] }],
    });
    const enqueue = useEnqueue();
    const enqueueGroup = (group: PlaylistGroup, atBeginning: boolean) =>
        enqueue.mutate({ ...groupSelection(group), atBeginning }, { onError: showError });
    const foldable = !searching && !sorting;
    const foldingItems = useFoldingItems();
    const groupMenu = useRowMenu((group: PlaylistGroup) => {
        const allOn = group.enabledCount === group.count;
        return [
            {
                label: t('playlist.enqueue'),
                icon: 'playlist_add',
                onSelect: () => enqueueGroup(group, false),
            },
            {
                label: t('playlist.enqueueFirst'),
                icon: 'playlist_play',
                onSelect: () => enqueueGroup(group, true),
            },
            {
                label: t('favorites.add'),
                icon: 'heart_plus',
                onSelect: () => void favoriteActions.addSelection(groupSelection(group)).catch(showError),
            },
            ...(switches && !docked
                ? [
                      {
                          label: t(allOn ? 'playlist.disable' : 'playlist.enable'),
                          icon: allOn
                              ? 'check_box'
                              : group.enabledCount
                                ? 'indeterminate_check_box'
                                : 'check_box_outline_blank',
                          onSelect: () => switchGroup(group, !allOn),
                      },
                  ]
                : []),
            menuSeparator,
            ...foldingItems(group, {
                toggle: toggleGroup,
                setAll: expanded =>
                    setExpanded.mutate({ expanded, revision: playlist.revision }, { onError: showError }),
                disabled: !foldable,
            }),
            menuSeparator,
            ...removal.selectionItems(() => groupSelection(group)),
        ];
    });

    // The selection goes by positions in the list, each with its group: the server
    // picks out the items, so the client never has to load them.
    const keys = useSelectionKeys({
        mode,
        rows,
        active,
        list: scrollRef,
        disabled: !mine || sorting,
        dragging: drag.state !== null,
    });
    // Enter: a header folds, an item plays.
    const activate = (row: PlaylistRow) => {
        if (row.kind === 'group') toggleGroup(row.group);
        else {
            const item = itemAt(row.position);
            if (item && !sorting) play(item);
        }
    };
    useSearchKeys({ mode, rows, active, list: scrollRef, disabled: !mine || sorting, onEnter: activate });
    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (rows.count === 0) return;
        const pageRows = Math.max(1, Math.floor(event.currentTarget.clientHeight / itemRowHeight) - 1);
        if (keys.onKeyDown(event, rows.count, pageRows)) return;
        const current = active.row === null ? null : rows.at(active.row);
        const item = current?.kind === 'item' ? itemAt(current.position) : undefined;
        if (!sorting && active.move(event.key, rows.count, pageRows) !== null) event.preventDefault();
        else if (event.key === 'Enter' && current) {
            activate(current);
            event.preventDefault();
        } else if (event.key === ' ' && current && selecting) {
            keys.toggle(current);
            event.preventDefault();
        } else if (event.key === 'Delete' && mine && !sorting) {
            if (selecting) removal.removeSelection(mode.itemsSelection);
            else if (current?.kind === 'group') removal.removeSelection(groupSelection(current.group));
            else if (item) removal.removeTrack(trackOf(item));
            event.preventDefault();
        }
    };

    const onItemClick = (event: MouseEvent, row: number, item: PlaylistItem) => {
        if (mode.mode === 'select') {
            keys.pick(row, () => keys.toggle(rows.at(row)));
            return;
        }
        // The sort has no cursor: only the playing track is marked there.
        if (sorting) return;
        active.select(rows.keyAt(row));
        // Decided per gesture rather than per device: a tap plays at once, a mouse
        // click only selects and the double click plays.
        const { pointerType } = event.nativeEvent as PointerEvent;
        if (searching || pointerType !== 'mouse') play(item);
    };

    // Files dragged in from outside: a line shows where they would go, and the drop
    // asks beside it where they should. An empty playlist has one place only, so
    // its files go without asking.
    const fileDrag = useFileDrag();
    const fileUpload = useFileUpload();
    const uploadRefusal = fileUpload.refusal(playlist);
    const emptyPlaylist = playlist.itemCount === 0;
    const [dragOffset, setDragOffset] = useState(0);
    const [dropMenu, setDropMenu] = useState<DropMenu | null>(null);
    const dropMenuId = useId();
    const dropAnchor = anchorName('drop', dropMenuId);
    const dragOver = mine && fileDrag.isOver(scrollRef.current);

    // The playlist's index of the item at a position of the list: a search lists
    // the matches, each with its own index; null while its page is loading.
    const playlistIndexAt = (position: number) => {
        if (!searching) return position;
        const page = loaded.get(Math.floor(position / pageSize));
        return page?.items[position - page.offset]?.index ?? null;
    };

    // The edge between rows nearest to a point of the list: where its line lies,
    // and the index the files would take, before the item that follows the edge or
    // right after the last one.
    const dropPlace = (offset: number) => {
        const hit = virtualizer.getVirtualItemForOffset(offset);
        const boundary = !hit ? 0 : offset < hit.start + hit.size / 2 ? hit.index : hit.index + 1;
        const before = boundary < rows.count ? rows.at(boundary) : null;
        const last = rows.itemCount > 0 ? playlistIndexAt(rows.itemCount - 1) : null;
        return {
            offset:
                boundary < rows.count
                    ? (virtualizer.measurementsCache[boundary]?.start ?? 0)
                    : virtualizer.getTotalSize(),
            index: before
                ? playlistIndexAt(before.kind === 'item' ? before.position : before.group.firstPosition)
                : last === null
                  ? null
                  : last + 1,
        };
    };
    const listOffset = (event: DragEvent<HTMLElement>) =>
        event.clientY - event.currentTarget.getBoundingClientRect().top + event.currentTarget.scrollTop;

    const onFileDragOver = (event: DragEvent<HTMLElement>) => {
        if (!mine || !hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = uploadRefusal ? 'none' : 'copy';
        // The event comes again and again while the pointer rests, so the list
        // keeps scrolling at an edge.
        const scroll = event.currentTarget;
        const rect = scroll.getBoundingClientRect();
        const above = event.clientY - rect.top;
        const below = rect.bottom - event.clientY;
        if (above < dropEdge) scroll.scrollTop -= dropScrollStep * (1 - Math.max(above, 0) / dropEdge);
        else if (below < dropEdge) scroll.scrollTop += dropScrollStep * (1 - Math.max(below, 0) / dropEdge);
        setDragOffset(listOffset(event));
    };

    const onFileDrop = (event: DragEvent<HTMLElement>) => {
        if (!mine || !hasFiles(event)) return;
        event.preventDefault();
        if (uploadRefusal) return;
        if (emptyPlaylist) {
            void fileUpload.drop(event.dataTransfer, { playlistId: playlist.id, placement: { kind: 'end' } });
            return;
        }
        setDropMenu({ ...dropPlace(listOffset(event)), files: null });
        readDroppedFiles(event.dataTransfer).then(
            files => setDropMenu(menu => menu && { ...menu, files }),
            error => {
                setDropMenu(null);
                showError(error);
            },
        );
    };

    const dropMenuShown = dropMenu !== null;
    const dropFilesRead = dropMenu?.files != null;
    useEffect(() => {
        const menu = document.getElementById(dropMenuId);
        if (!menu || !dropMenuShown) return;
        if (!menu.matches(':popover-open')) menu.showPopover();
        // The items wait for the files to be read; then Enter takes the first.
        if (dropFilesRead) menu.querySelector<HTMLButtonElement>('[role=menuitem]:enabled')?.focus();
    }, [dropMenuId, dropMenuShown, dropFilesRead]);

    let dropHeading;
    let dropItems: MenuEntry[] = [];
    if (dropMenu) {
        const { files } = dropMenu;
        const refused = files && fileUpload.filesRefusal(files);
        dropHeading = !files
            ? t('upload.reading')
            : (refused ??
              t('upload.summary', { count: files.length, size: formatSize(totalSize(files), i18n.language) }));
        const send = (placement: UploadPlacement) => () =>
            fileUpload.start({ playlistId: playlist.id, placement }, files!);
        const disabled = !files || refused !== null;
        dropItems = [
            {
                label: t('upload.here'),
                icon: 'playlist_add',
                disabled: disabled || dropMenu.index === null,
                onSelect: send({ kind: 'at', index: dropMenu.index ?? 0 }),
            },
            { label: t('upload.atStart'), icon: 'vertical_align_top', disabled, onSelect: send({ kind: 'start' }) },
            { label: t('upload.atEnd'), icon: 'vertical_align_bottom', disabled, onSelect: send({ kind: 'end' }) },
            { label: t('upload.scatter'), icon: 'shuffle', disabled, onSelect: send({ kind: 'scatter' }) },
            menuSeparator,
            { label: t('actions.cancel'), icon: 'close', onSelect: () => {} },
        ];
    }
    let dropLine;
    if (dropMenu) dropLine = { offset: dropMenu.offset, shown: dropMenu.index !== null };
    else if (dragOver && !uploadRefusal && !emptyPlaylist) {
        const place = dropPlace(dragOffset);
        if (place.index !== null) dropLine = { offset: place.offset, shown: true };
    }

    const rowId = (row: number) => `${listId}-${row}`;
    const rowProps = {
        view: playlist,
        playlistId: playlist.id,
        revision: playlist.revision,
        docked,
        thumbnailSize: itemRowHeight - 2 * thumbnailMargin,
        widestNumber,
        selecting,
        sorting: sortable,
    };

    let ghost = null;
    if (drag.state) {
        const row = rows.at(drag.state.source.row);
        const item = row.kind === 'item' ? (itemAt(row.position) ?? draggedItem.current) : undefined;
        const style = { height: drag.state.source.ghostHeight, transform: `translateY(${drag.state.top}px)` };
        ghost =
            row.kind === 'group' ? (
                <div className={clsx(styles.groupRow, styles.ghost)} style={style}>
                    <DragHandle />
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
                className={clsx(styles.page, styles.droppable, active.byKeyboard && styles.keyboard)}
                aria-label={playlist.name}
                role="listbox"
                tabIndex={0}
                aria-activedescendant={active.row === null || sorting ? undefined : rowId(active.row)}
                onKeyDown={onKeyDown}
                onDragOver={onFileDragOver}
                onDrop={onFileDrop}
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
                                <SkeletonRow {...rowProps} index={i} />
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
                                                {...mode.groupCheckState(row.group.index)}
                                                onChange={event =>
                                                    keys.pick(index, () => keys.setSelected(row, event.target.checked))
                                                }
                                            />
                                        )}
                                        {sortable &&
                                            (rows.spanAt(index)?.rowCount !== rows.count ? (
                                                <DragHandle onDragStart={event => drag.start(index, event)} />
                                            ) : (
                                                // The only group has nowhere to go; its name stays put all the same.
                                                <span className={styles.leading} />
                                            ))}
                                        {switches && docked && !selecting && !sorting && (
                                            <span className={styles.leading}>
                                                <Switch
                                                    data-testid="group-switch"
                                                    title={t('playlist.groupSwitch')}
                                                    checked={row.group.enabledCount === row.group.count}
                                                    indeterminate={
                                                        row.group.enabledCount > 0 &&
                                                        row.group.enabledCount < row.group.count
                                                    }
                                                    onChange={enabled => switchGroup(row.group, enabled)}
                                                />
                                            </span>
                                        )}
                                        <GroupRow
                                            group={row.group}
                                            onToggle={searching || sorting ? undefined : () => toggleGroup(row.group)}
                                        />
                                        {hasMenu && (
                                            <RowMenuIcon
                                                title={t('playlist.groupActions')}
                                                menu={groupMenu.button(index, row.group)}
                                            />
                                        )}
                                    </div>
                                );
                            const item = itemAt(row.position);
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
                                        item && item.index === playingIndex && styles.playing,
                                        hidden && styles.hidden,
                                    )}
                                    style={{ height: itemRowHeight, transform }}
                                    data-enabled={item && switches ? item.enabled : undefined}
                                    onClickCapture={event => keys.onRowClick(event, index)}
                                    onClick={event => item && onItemClick(event, index, item)}
                                    onDoubleClick={() => item && mode.mode === null && play(item)}
                                >
                                    {item ? (
                                        <ItemRow
                                            {...rowProps}
                                            item={item}
                                            number={numberOf(row, item) ?? 0}
                                            queueMark={queueMark(queuePositions.get(trackKey(playlist.id, item.index)))}
                                            selected={selecting && mode.isSelected(row.position, row.group?.index)}
                                            onSelect={selected =>
                                                keys.pick(index, () => keys.setSelected(row, selected))
                                            }
                                            onDragStart={event => {
                                                draggedItem.current = item;
                                                drag.start(index, event);
                                            }}
                                            menu={hasMenu ? rowMenu.button(index, item) : undefined}
                                            onRate={onRate}
                                            onSwitch={onSwitch}
                                        />
                                    ) : (
                                        <SkeletonRow {...rowProps} index={index} />
                                    )}
                                </div>
                            );
                        })}
                        {ghost}
                    </div>
                )}
                {dropLine && (
                    <div
                        className={clsx(styles.dropLine, !dropLine.shown && styles.dropAnchor)}
                        data-testid="drop-line"
                        style={
                            { top: Math.max(dropLine.offset, dropLineInset), anchorName: dropAnchor } as CSSProperties
                        }
                    />
                )}
                <MenuPopover
                    id={dropMenuId}
                    anchor={dropAnchor}
                    heading={dropHeading}
                    items={dropItems}
                    onClose={() => setDropMenu(null)}
                />
                {rowMenu.popover}
                {groupMenu.popover}
                {removal.dialogs}
                {download.dialogs}
            </section>
            {/* Where no line shows the place, the frame shows that the list takes the files. */}
            {dragOver && !dropLine && uploadRefusal === null && (
                <div className={styles.dropFrame} data-testid="drop-frame" />
            )}
            {dragOver && uploadRefusal && (
                <div className={styles.dropRefused} data-testid="drop-refused">
                    <Icon>block</Icon>
                    <span>{uploadRefusal}</span>
                </div>
            )}
        </FastScroll>
    );
}

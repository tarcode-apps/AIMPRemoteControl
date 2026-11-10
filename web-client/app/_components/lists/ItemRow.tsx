'use client';

import type { Playlist, PlaylistGroup, PlaylistItem } from '@/app/_api/types';
import { formatDuration } from '@/app/_utils/format';
import clsx from 'clsx';
import { useEffect, useRef, type CSSProperties, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, useHoldGesture } from '../buttons';
import { ItemCover } from '../cover';
import { Icon } from '../icons';
import { Checkbox } from '../inputs';
import type { RowMenuButton } from '../menus';
import { Rating } from '../rating';
import { Skeleton } from '../skeleton';
import styles from './ListPage.module.scss';

export const twoLineRowHeight = 56;
export const oneLineRowHeight = 44;
// The thumbnail is square and leaves this much of the row above and below.
export const thumbnailMargin = 6;

// What a list shows of its items: a playlist's own view settings, or fixed ones.
export type RowView = Pick<
    Playlist,
    'showNumbers' | 'showThumbnails' | 'showSecondLine' | 'showDuration' | 'showMarks' | 'showSwitches'
>;

// The view of the lists that have no settings of their own: favorites, the
// queue and a search.
export const fixedRowView: RowView = {
    showNumbers: true,
    showThumbnails: true,
    showSecondLine: true,
    showDuration: true,
    showMarks: false,
    showSwitches: false,
};

// A group's heading row.
export const groupRowHeight = 40;
// Rows drawn beyond the viewport on each side.
export const overscanRows = 6;

// The switch column is the player's own: a mobile has no room for it and
// switches tracks from the menu. It shares its slot with the selection
// checkbox and the drag handle, which take it over in their modes.
const showsSwitch = (view: RowView, docked: boolean, selecting: boolean, sorting: boolean) =>
    view.showSwitches && docked && !selecting && !sorting;

export type SwitchProps = {
    title: string;
    checked: boolean;
    // Partly on, as a group with some tracks off.
    indeterminate?: boolean;
    onChange(checked: boolean): void;
    'data-testid'?: string;
};

// The playback switch of a track or a group, drawn small and dim as in the
// player. Its clicks stay its own: the row's would select or play the track.
export function Switch({ title, checked, indeterminate = false, onChange, ...rest }: SwitchProps) {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (ref.current) ref.current.indeterminate = indeterminate;
    }, [indeterminate]);
    const held = useHoldGesture<HTMLInputElement>(title);
    return (
        <>
            <input
                {...rest}
                ref={ref}
                type="checkbox"
                aria-label={title}
                title={title}
                tabIndex={-1}
                className={styles.switch}
                style={held.style()}
                checked={checked}
                // The click that ended a hold is cancelled before this fires.
                onChange={event => {
                    if (!event.nativeEvent.defaultPrevented) onChange(event.target.checked);
                }}
                {...held.handlers({ onClick: event => event.stopPropagation() })}
                onDoubleClick={event => event.stopPropagation()}
            />
            {held.tooltip}
        </>
    );
}

// A switched-off track on a mobile, which has no switch column.
function SwitchedOffMark() {
    const { t } = useTranslation();
    const title = t('playlist.switchedOff');
    const held = useHoldGesture<HTMLSpanElement>(title);
    return (
        <>
            <Icon className={styles.switchedOff} title={title} style={held.style()} {...held.handlers()}>
                disabled_by_default
            </Icon>
            {held.tooltip}
        </>
    );
}

// A one-line row has no room for a thumbnail.
const showsThumbnail = (view: RowView) => view.showThumbnails && view.showSecondLine;

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
    // Lets the stars be set in the row; without it they are only shown.
    onRate?(item: PlaylistItem, mark: number): void;
    // The row's switch, where the view shows one.
    onSwitch?(item: PlaylistItem, enabled: boolean): void;
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
    onRate,
    onSwitch,
}: ItemRowProps) {
    const { t } = useTranslation();
    const label = view.showNumbers && `${number}.`;
    const rating = (
        <Rating
            className={styles.rating}
            mark={item.mark}
            rating={item.rating}
            displayingMark={item.displayingMark}
            onChange={onRate && (mark => onRate(item, mark))}
        />
    );
    // A mobile has no switch column, so a track switched off is marked beside
    // the details, away from the numbers.
    const switchedOff = view.showSwitches && !docked && !item.enabled;
    return (
        <>
            {selecting && (
                <span className={styles.leading}>
                    <Checkbox
                        variant="list"
                        title={t('playlist.selectItem')}
                        tabIndex={-1}
                        checked={selected}
                        onChange={event => onSelect(event.target.checked)}
                        onClick={event => event.stopPropagation()}
                    />
                </span>
            )}
            {sorting && <DragHandle onDragStart={onDragStart} />}
            {showsSwitch(view, docked, selecting, sorting) && (
                <span className={styles.leading}>
                    <Switch
                        data-testid="item-switch"
                        title={t('playlist.itemSwitch')}
                        checked={item.enabled}
                        onChange={enabled => onSwitch?.(item, enabled)}
                    />
                </span>
            )}
            {label && docked && (
                <div className={styles.number} data-widest={widestNumber}>
                    {label}
                </div>
            )}
            {showsThumbnail(view) && (
                <ItemCover
                    // Its own for each track: a row handed to another track must not show
                    // the last one's cover while the new one loads.
                    key={`${playlistId}/${item.index}`}
                    playlistId={playlistId}
                    index={item.index}
                    coverKey={item.cover}
                    revision={revision}
                    size={thumbnailSize}
                    className={styles.thumbnail}
                />
            )}
            <div className={styles.text}>
                <div className={styles.line}>
                    <div className={styles.title}>
                        {label && !docked && `${label} `}
                        {item.displayText}
                    </div>
                    {queueMark && (
                        <div className={styles.queueMark} title={t('playlist.inQueue')}>
                            {queueMark}
                        </div>
                    )}
                    {switchedOff && !view.showSecondLine && <SwitchedOffMark />}
                    {view.showMarks && !view.showSecondLine && rating}
                    {view.showDuration && <div className={styles.duration}>{formatDuration(item.duration)}</div>}
                </div>
                {view.showSecondLine && (
                    <div className={styles.line}>
                        {switchedOff && <SwitchedOffMark />}
                        <div className={styles.details}>{item.secondLine}</div>
                        {view.showMarks && rating}
                    </div>
                )}
            </div>
            {menu && <RowMenuIcon title={t('playlist.itemActions')} menu={menu} />}
        </>
    );
}

// The ⋮ button of a row, which opens the list's shared menu at the row.
export function RowMenuIcon({ title, menu }: { title: string; menu: RowMenuButton }) {
    return (
        <IconButton
            title={title}
            aria-haspopup="menu"
            aria-expanded={menu.open}
            tabIndex={-1}
            className={clsx(styles.menuButton, menu.open && styles.menuButtonOpen)}
            style={{ anchorName: menu.anchor } as CSSProperties}
            popoverTarget={menu.popoverTarget}
            popoverTargetAction={menu.popoverTargetAction}
            // The row's own clicks would play the track.
            onDoubleClick={event => event.stopPropagation()}
            onClick={event => {
                event.stopPropagation();
                menu.onClick(event);
            }}
        >
            <Icon>more_vert</Icon>
        </IconButton>
    );
}

// Placeholder titles of varying length, so that the rows do not read as one block.
const skeletonTitleWidths = ['45%', '75%', '60%'];

// `index` is the row's place in the list, which picks its placeholder's length.
export function SkeletonRow({
    index,
    view,
    docked,
    thumbnailSize,
    widestNumber,
    selecting,
    sorting,
}: RowProps & { index: number }) {
    return (
        <>
            {selecting && (
                <span className={styles.leading}>
                    <Skeleton shape="rect" width={16} height={16} />
                </span>
            )}
            {sorting && <DragHandle />}
            {showsSwitch(view, docked, selecting, sorting) && (
                <span className={styles.leading}>
                    <Skeleton shape="rect" width={12} height={12} />
                </span>
            )}
            {view.showNumbers && docked && (
                <div className={styles.number} data-widest={widestNumber}>
                    <Skeleton width="100%" />
                </div>
            )}
            {showsThumbnail(view) && (
                <Skeleton shape="rect" className={styles.thumbnail} width={thumbnailSize} height={thumbnailSize} />
            )}
            <div className={styles.text}>
                <div className={styles.line}>
                    <div className={styles.title}>
                        <Skeleton width={skeletonTitleWidths[index % skeletonTitleWidths.length]} />
                    </div>
                    {view.showDuration && <Skeleton className={styles.duration} width="2.5em" />}
                </div>
                {view.showSecondLine && (
                    <div className={styles.line}>
                        <div className={styles.details}>
                            <Skeleton width="40%" />
                        </div>
                    </div>
                )}
            </div>
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

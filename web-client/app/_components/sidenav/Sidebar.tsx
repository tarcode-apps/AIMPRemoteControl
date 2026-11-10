'use client';

import { activeEffects, useEffects } from '@/app/_api/effects';
import { errorMessage } from '@/app/_api/helpers/errors';
import { usePlaylists } from '@/app/_api/playlists';
import { useQueue } from '@/app/_api/queue';
import { useSettings } from '@/app/_api/settings';
import { useTimer } from '@/app/_api/timer';
import type { Playlist } from '@/app/_api/types';
import { useFocusReturn } from '@/app/_hooks/useFocusReturn';
import { useGlobalKey } from '@/app/_hooks/useGlobalKey';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { useFavorites } from '@/app/_state/Favorites';
import { hasFiles, useFileDrag } from '@/app/_state/FileDrag';
import { useNavigation } from '@/app/_state/Navigation';
import { usePlaylistSelection } from '@/app/_state/PlaylistSelection';
import { useUploads } from '@/app/_state/Uploads';
import { media } from '@/app/_styles/media';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    useRef,
    useState,
    type CSSProperties,
    type DragEvent,
    type KeyboardEvent,
    type MouseEvent,
    type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../buttons';
import { Icon } from '../icons';
import { SearchField } from '../inputs';
import { useRowMenu } from '../menus';
import { usePlayerPanel } from '../player';
import { useFileUpload, usePlaylistActions } from '../playlists';
import { Skeleton } from '../skeleton';
import { useDrawer } from './Drawer';
import { PlayerCard } from './PlayerCard';
import styles from './Sidebar.module.scss';
import { TimerBadge } from './TimerBadge';

type NavItem = {
    href: string;
    label: 'screens.timer' | 'screens.effects' | 'screens.favorites' | 'screens.queue';
    icon: string;
    // Shows a back arrow and sits over the main screen.
    second: boolean;
};

const toolItems: NavItem[] = [
    { href: '/timer/', label: 'screens.timer', icon: 'schedule', second: true },
    { href: '/effects/', label: 'screens.effects', icon: 'equalizer', second: true },
    { href: '/favorites/', label: 'screens.favorites', icon: 'favorite', second: false },
    { href: '/queue/', label: 'screens.queue', icon: 'list', second: true },
];

const playlistSkeletonWidths = ['55%', '40%', '70%', '45%'];

const focusableSelector = 'a[href], button:not(:disabled), input';

// The arrow keys walk the rows marked `data-row`, each with a main control first
// and, for some, a second one to its right: the add button after the playlist
// search, the menu after a playlist. The keys of the text in the search field are
// left alone.
function onNavKeyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-row]')].filter(row =>
        row.checkVisibility(),
    );
    const current = rows.findIndex(row => row.contains(target));
    if (current < 0) return;
    const controls = (row: HTMLElement) => [...row.querySelectorAll<HTMLElement>(focusableSelector)];
    const main = (row: HTMLElement) => controls(row)[0];
    const isMain = target === main(rows[current]);
    const typing = target instanceof HTMLInputElement;
    const typingAtEnd = typing && target.selectionStart === target.value.length;

    let next: HTMLElement | undefined;
    switch (event.key) {
        case 'ArrowDown':
            next = main(rows[Math.min(current + 1, rows.length - 1)]);
            break;
        case 'ArrowUp':
            next = main(rows[Math.max(current - 1, 0)]);
            break;
        case 'Home':
            if (typing) return;
            next = main(rows[0]);
            break;
        case 'End':
            if (typing) return;
            next = main(rows[rows.length - 1]);
            break;
        case 'ArrowRight':
            if (!isMain || (typing && !typingAtEnd)) return;
            next = controls(rows[current]).at(-1);
            break;
        case 'ArrowLeft':
            if (isMain) return;
            next = main(rows[current]);
            break;
        default:
            return;
    }
    if (!next || next === target) return;
    event.preventDefault();
    next.focus();
}

function matches(playlist: Playlist, filter: string) {
    return playlist.name.toLocaleLowerCase().includes(filter);
}

// A click the keys made has no detail.
const byKeyboard = (event: MouseEvent) => event.detail === 0;

function Playlists() {
    const { t } = useTranslation();
    const pathname = usePathname();
    const { openScreen, focusScreen } = useNavigation();
    const { closeThen, open: openDrawer } = useDrawer();
    const { error, isPending, isError, refetch, isRefetching } = usePlaylists();
    // Ctrl+K (Cmd+K on a Mac) is the quick switch: the search of the playlists
    // takes the focus, the arrows walk them from it, and Escape on the emptied
    // field sends the focus back.
    const focus = useFocusReturn();
    const searchInput = useRef<HTMLInputElement>(null);
    const docked = useMediaQuery(media.drawerDocked);
    useGlobalKey(
        event => (event.ctrlKey || event.metaKey) && event.code === 'KeyK',
        () => {
            focus.remember();
            if (!docked) openDrawer();
            searchInput.current?.focus();
        },
        { inFields: true },
    );
    const { playlists, selected, select } = usePlaylistSelection();
    const [filter, setFilter] = useState('');
    const actions = usePlaylistActions(() => setFilter(''));
    const menu = useRowMenu((playlist: Playlist) => [actions.renameItem(playlist), actions.removeItem(playlist)]);
    const shown = playlists?.filter(playlist => matches(playlist, filter.trim().toLocaleLowerCase()));
    // The playlists are one stop of the Tab key, the arrows walking them: the row
    // last focused takes the stop, else the selected playlist, else the first.
    const [focused, setFocused] = useState<string | null>(null);
    const tabStop =
        shown?.find(playlist => playlist.id === focused) ??
        shown?.find(playlist => playlist === selected) ??
        shown?.[0];

    // Files dragged in go to the end of the playlist they are dropped on, or into a
    // new one at the zone that takes the place of the search meanwhile.
    const fileDrag = useFileDrag();
    const fileUpload = useFileUpload();
    const uploads = useUploads();
    const uploadRefusal = fileUpload.refusal(null);
    const [newZone, setNewZone] = useState<HTMLElement | null>(null);
    const [dropRow, setDropRow] = useState<{ id: string; element: Element } | null>(null);
    const isDropRow = (playlist: Playlist) => dropRow?.id === playlist.id && fileDrag.isOver(dropRow.element);
    const dropTarget = (playlist: Playlist) => ({
        onDragOver: (event: DragEvent<HTMLElement>) => {
            if (!hasFiles(event)) return;
            event.preventDefault();
            const refused = fileUpload.refusal(playlist) !== null;
            event.dataTransfer.dropEffect = refused ? 'none' : 'copy';
            const element = event.currentTarget;
            setDropRow(current =>
                refused ? null : current?.element === element ? current : { id: playlist.id, element },
            );
        },
        onDrop: (event: DragEvent<HTMLElement>) => {
            if (!hasFiles(event)) return;
            event.preventDefault();
            if (fileUpload.refusal(playlist) === null)
                void fileUpload.drop(event.dataTransfer, { playlistId: playlist.id, placement: { kind: 'end' } });
        },
    });
    const newPlaylistTarget = {
        onDragOver: (event: DragEvent<HTMLElement>) => {
            if (!hasFiles(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = uploadRefusal ? 'none' : 'copy';
        },
        onDrop: (event: DragEvent<HTMLElement>) => {
            if (!hasFiles(event)) return;
            event.preventDefault();
            if (!uploadRefusal) void fileUpload.drop(event.dataTransfer, { playlistId: null }, select);
        },
    };
    const newPlaylistJobs = uploads.jobs.filter(job => job.playlistId === null);

    // Opened with the keys, the playlist takes the focus, for the keys to go on there.
    const open = (playlist: Playlist, byKeys: boolean) =>
        closeThen(() => {
            select(playlist.id);
            if (byKeys) focusScreen('/');
            openScreen('/');
        });

    let list;
    if (isPending)
        list = (
            <ul className={styles.list}>
                {playlistSkeletonWidths.map((width, i) => (
                    <li key={i} className={styles.item}>
                        <Skeleton shape="circle" width={24} height={24} />
                        <Skeleton width={width} />
                    </li>
                ))}
            </ul>
        );
    else if (isError)
        list = (
            <div className={styles.error} role="alert">
                <Icon>error</Icon>
                <span className={styles.errorText}>{errorMessage(error, t)}</span>
                <IconButton title={t('actions.retry')} disabled={isRefetching} onClick={() => refetch()}>
                    <Icon>refresh</Icon>
                </IconButton>
            </div>
        );
    else if (shown?.length === 0) list = <p className={styles.notFound}>{t('playlists.notFound')}</p>;
    else
        list = (
            <ul className={styles.list}>
                {shown?.map((playlist, index) => {
                    const active = pathname === '/' && playlist === selected;
                    const button = menu.button(index, playlist);
                    return (
                        <li key={playlist.id} data-row className={styles.row} {...dropTarget(playlist)}>
                            <Link
                                href="/"
                                className={clsx(
                                    styles.item,
                                    styles.playlist,
                                    active && styles.active,
                                    isDropRow(playlist) && styles.dropOver,
                                )}
                                aria-current={active ? 'true' : undefined}
                                tabIndex={playlist === tabStop ? 0 : -1}
                                onFocus={() => setFocused(playlist.id)}
                                onClick={event => {
                                    event.preventDefault();
                                    open(playlist, byKeyboard(event));
                                }}
                                onKeyDown={event => {
                                    if (event.key !== 'Delete') return;
                                    event.preventDefault();
                                    actions.removeItem(playlist).onSelect();
                                }}
                            >
                                <Icon>queue_music</Icon>
                                <span className={styles.label}>{playlist.name}</span>
                            </Link>
                            <IconButton
                                title={t('playlists.actions')}
                                aria-haspopup="menu"
                                aria-expanded={button.open}
                                tabIndex={-1}
                                className={clsx(styles.menuButton, button.open && styles.menuButtonOpen)}
                                style={{ anchorName: button.anchor } as CSSProperties}
                                popoverTarget={button.popoverTarget}
                                popoverTargetAction={button.popoverTargetAction}
                                onClick={button.onClick}
                            >
                                <Icon>more_vert</Icon>
                            </IconButton>
                        </li>
                    );
                })}
                {newPlaylistJobs.map(job => (
                    <li
                        key={job.id}
                        className={styles.row}
                        data-testid="new-playlist-upload"
                        role={job.state === 'failed' ? 'alert' : undefined}
                    >
                        <span className={clsx(styles.item, styles.pending)}>
                            <Icon>
                                {job.state === 'failed' ? 'error' : job.state === 'waiting' ? 'schedule' : 'upload'}
                            </Icon>
                            {job.state === 'failed' ? (
                                <span className={styles.failure}>
                                    {t('upload.failed', { name: job.name, message: errorMessage(job.error, t) })}
                                </span>
                            ) : (
                                <>
                                    <span className={styles.label} title={job.name}>
                                        {t('upload.newPlaylist')}
                                    </span>
                                    <span>
                                        {job.state === 'waiting'
                                            ? t('upload.queued')
                                            : `${Math.round(job.fraction * 100)}%`}
                                    </span>
                                </>
                            )}
                            <IconButton
                                title={t(job.state === 'failed' ? 'actions.close' : 'actions.cancel')}
                                className={styles.pendingButton}
                                onClick={() => uploads.cancel(job.id)}
                            >
                                <Icon>close</Icon>
                            </IconButton>
                        </span>
                    </li>
                ))}
                {menu.popover}
            </ul>
        );

    return (
        <>
            <div
                data-row
                className={styles.playlistsBar}
                // Enter in the search opens the first playlist found.
                onKeyDown={event => {
                    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement) || !shown?.length) return;
                    event.preventDefault();
                    open(shown[0], true);
                }}
            >
                {fileDrag.active ? (
                    <div
                        ref={setNewZone}
                        className={clsx(
                            styles.newZone,
                            uploadRefusal && styles.newZoneRefused,
                            !uploadRefusal && fileDrag.isOver(newZone) && styles.newZoneOver,
                        )}
                        data-testid="new-playlist-zone"
                        {...newPlaylistTarget}
                    >
                        <Icon>{uploadRefusal ? 'block' : 'playlist_add'}</Icon>
                        <span className={styles.label}>
                            {uploadRefusal ?? t(fileDrag.isOver(newZone) ? 'upload.dropNew' : 'upload.newPlaylist')}
                        </span>
                    </div>
                ) : (
                    <SearchField
                        className={styles.search}
                        value={filter}
                        onChange={setFilter}
                        onEscape={focus.back}
                        inputRef={searchInput}
                        placeholder={t('playlists.searchPlaceholder')}
                        actions={
                            <IconButton
                                title={t('playlists.create')}
                                className={styles.createButton}
                                onClick={actions.create}
                            >
                                <Icon>playlist_add</Icon>
                            </IconButton>
                        }
                    />
                )}
            </div>
            {list}
            {actions.dialogs}
        </>
    );
}

export function Sidebar() {
    const pathname = usePathname();
    const { openScreen, openSecondScreen, focusScreen } = useNavigation();
    const { closeThen } = useDrawer();
    const { expand } = usePlayerPanel();
    const { t } = useTranslation();
    const { data: queue } = useQueue();
    const { records: favorites } = useFavorites();
    const { data: settings } = useSettings();
    const { data: timer } = useTimer(settings?.permissions.scheduler === true);
    const { data: effects } = useEffects();
    const soundChanged = effects && activeEffects(effects);
    // A count, or a picture of the state, as the timer's.
    const badges: Partial<Record<string, ReactNode>> = {
        '/timer/': timer?.timer && <TimerBadge timer={timer.timer} />,
        '/effects/': soundChanged && (
            <Icon
                className={styles.badgeIcon}
                title={t(soundChanged === 'equalizer' ? 'effects.enable' : 'effects.effectsOn')}
            >
                {soundChanged === 'equalizer' ? 'equalizer' : 'graphic_eq'}
            </Icon>
        ),
        '/queue/': queue?.suspended ? '!' : queue?.items.length || null,
        '/favorites/': favorites.length || null,
    };

    const renderItem = ({ href, label, icon, second }: NavItem) => {
        const active = pathname === href;
        const badge = badges[href];
        return (
            <li key={href} data-row>
                <Link
                    href={href}
                    className={clsx(styles.item, active && styles.active)}
                    aria-current={active ? 'page' : undefined}
                    onClick={event => {
                        event.preventDefault();
                        const byKeys = byKeyboard(event);
                        closeThen(() => {
                            if (byKeys) focusScreen(href);
                            if (second) openSecondScreen(href);
                            else openScreen(href);
                        });
                    }}
                >
                    <Icon>{icon}</Icon>
                    <span className={styles.label}>{t(label)}</span>
                    {badge ? (
                        <span className={clsx(styles.badge, typeof badge === 'object' && styles.pictureBadge)}>
                            {badge}
                        </span>
                    ) : null}
                </Link>
            </li>
        );
    };

    return (
        <nav className={styles.sidebar} aria-label={t('nav.main')} onKeyDown={onNavKeyDown}>
            <PlayerCard />
            <div className={styles.playerNav}>
                <ul className={styles.list}>
                    <li data-row>
                        <button type="button" className={styles.item} onClick={() => closeThen(expand)}>
                            <Icon>home</Icon>
                            <span className={styles.label}>{t('screens.player')}</span>
                        </button>
                    </li>
                </ul>
                <hr className={styles.divider} />
            </div>
            <ul className={styles.list}>{toolItems.map(renderItem)}</ul>
            <hr className={styles.divider} />
            <Playlists />
        </nav>
    );
}

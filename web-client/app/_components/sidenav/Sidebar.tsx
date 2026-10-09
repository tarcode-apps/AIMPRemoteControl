'use client';

import { errorMessage } from '@/app/_api/helpers/errors';
import { usePlaylists } from '@/app/_api/playlists';
import { useQueue } from '@/app/_api/queue';
import type { Playlist } from '@/app/_api/types';
import { useFavorites } from '@/app/_state/Favorites';
import { useNavigation } from '@/app/_state/Navigation';
import { usePlaylistSelection } from '@/app/_state/PlaylistSelection';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../buttons';
import { Icon } from '../icons';
import { SearchField } from '../inputs';
import { useRowMenu } from '../menus';
import { usePlayerPanel } from '../player';
import { usePlaylistActions } from '../playlists';
import { Skeleton } from '../skeleton';
import { useDrawer } from './Drawer';
import styles from './Sidebar.module.scss';

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

function Playlists() {
    const { t } = useTranslation();
    const pathname = usePathname();
    const { openScreen } = useNavigation();
    const { closeThen } = useDrawer();
    const { error, isPending, isError, refetch, isRefetching } = usePlaylists();
    const { playlists, selected, select } = usePlaylistSelection();
    const [filter, setFilter] = useState('');
    const actions = usePlaylistActions(() => setFilter(''));
    const menu = useRowMenu((playlist: Playlist) => [actions.renameItem(playlist), actions.removeItem(playlist)]);
    const shown = playlists?.filter(playlist => matches(playlist, filter.trim().toLocaleLowerCase()));

    const open = (playlist: Playlist) =>
        closeThen(() => {
            select(playlist.id);
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
                        <li key={playlist.id} data-row className={styles.row}>
                            <Link
                                href="/"
                                className={clsx(styles.item, styles.playlist, active && styles.active)}
                                aria-current={active ? 'true' : undefined}
                                onClick={event => {
                                    event.preventDefault();
                                    open(playlist);
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
                                popoverTargetAction="show"
                                onClick={button.onOpen}
                            >
                                <Icon>more_vert</Icon>
                            </IconButton>
                        </li>
                    );
                })}
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
                    open(shown[0]);
                }}
            >
                <SearchField
                    className={styles.search}
                    value={filter}
                    onChange={setFilter}
                    placeholder={t('playlists.searchPlaceholder')}
                />
                <IconButton title={t('playlists.create')} onClick={actions.create}>
                    <Icon>playlist_add</Icon>
                </IconButton>
            </div>
            {list}
            {actions.dialogs}
        </>
    );
}

export function Sidebar() {
    const pathname = usePathname();
    const { openScreen, openSecondScreen } = useNavigation();
    const { closeThen } = useDrawer();
    const { expand } = usePlayerPanel();
    const { t } = useTranslation();
    const { data: queue } = useQueue();
    const { records: favorites } = useFavorites();
    const badges: Partial<Record<string, string | number | null>> = {
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
                        closeThen(() => (second ? openSecondScreen(href) : openScreen(href)));
                    }}
                >
                    <Icon>{icon}</Icon>
                    <span className={styles.label}>{t(label)}</span>
                    {badge ? <span className={styles.badge}>{badge}</span> : null}
                </Link>
            </li>
        );
    };

    return (
        <nav className={styles.sidebar} aria-label={t('nav.main')} onKeyDown={onNavKeyDown}>
            <div className={styles.header}>
                <span className={styles.title}>{t('app.name')}</span>
            </div>
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

'use client';

import { errorMessage } from '@/app/_api/helpers/errors';
import { usePlaylists } from '@/app/_api/playlists';
import { useQueue } from '@/app/_api/queue';
import { useFavorites } from '@/app/_state/Favorites';
import { useNavigation } from '@/app/_state/Navigation';
import { usePlaylistSelection } from '@/app/_state/PlaylistSelection';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../buttons';
import { Icon } from '../icons';
import { usePlayerPanel } from '../player';
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

function Playlists() {
    const { t } = useTranslation();
    const pathname = usePathname();
    const { openScreen } = useNavigation();
    const { closeThen } = useDrawer();
    const { error, isPending, isError, refetch, isRefetching } = usePlaylists();
    const { playlists, selected, select } = usePlaylistSelection();

    if (isPending)
        return (
            <ul className={styles.list}>
                {playlistSkeletonWidths.map((width, i) => (
                    <li key={i} className={styles.item}>
                        <Skeleton shape="circle" width={24} height={24} />
                        <Skeleton width={width} />
                    </li>
                ))}
            </ul>
        );

    if (isError)
        return (
            <div className={styles.error} role="alert">
                <Icon>error</Icon>
                <span className={styles.errorText}>{errorMessage(error, t)}</span>
                <IconButton title={t('actions.retry')} disabled={isRefetching} onClick={() => refetch()}>
                    <Icon>refresh</Icon>
                </IconButton>
            </div>
        );

    return (
        <ul className={styles.list}>
            {playlists?.map(playlist => {
                const active = pathname === '/' && playlist === selected;
                return (
                    <li key={playlist.id}>
                        <Link
                            href="/"
                            className={clsx(styles.item, active && styles.active)}
                            aria-current={active ? 'true' : undefined}
                            onClick={event => {
                                event.preventDefault();
                                closeThen(() => {
                                    select(playlist.id);
                                    openScreen('/');
                                });
                            }}
                        >
                            <Icon>queue_music</Icon>
                            <span className={styles.label}>{playlist.name}</span>
                        </Link>
                    </li>
                );
            })}
        </ul>
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
            <li key={href}>
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
        <nav className={styles.sidebar} aria-label={t('nav.main')}>
            <div className={styles.header}>
                <span className={styles.title}>{t('app.name')}</span>
            </div>
            <div className={styles.playerNav}>
                <ul className={styles.list}>
                    <li>
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

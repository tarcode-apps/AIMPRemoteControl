'use client';

import { errorMessage } from '@/app/_api/errors';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../buttons';
import { Icon } from '../icons';
import { usePlayerPanel } from '../player';
import { usePlaylistSelection } from '../playlists';
import { Skeleton } from '../skeleton';
import { usePlaylists } from '@/app/_api/playlists';
import { useDrawer } from './Drawer';
import styles from './Sidebar.module.scss';

type NavItem = {
    href: string;
    label: 'screens.timer' | 'screens.effects' | 'screens.favorites' | 'screens.queue';
    icon: string;
};

const toolItems: NavItem[] = [
    { href: '/timer/', label: 'screens.timer', icon: 'schedule' },
    { href: '/effects/', label: 'screens.effects', icon: 'tune' },
    { href: '/favorites/', label: 'screens.favorites', icon: 'favorite' },
    { href: '/queue/', label: 'screens.queue', icon: 'queue_music' },
];

const playlistSkeletonWidths = ['55%', '40%', '70%', '45%'];

function Playlists() {
    const { t } = useTranslation();
    const pathname = usePathname();
    const { close } = useDrawer();
    const { collapse } = usePlayerPanel();
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
                            onClick={() => {
                                select(playlist.id);
                                collapse();
                                close();
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
    const { close } = useDrawer();
    const { expand } = usePlayerPanel();
    const { t } = useTranslation();

    const renderItem = ({ href, label, icon }: NavItem) => {
        const active = pathname === href;
        return (
            <li key={href}>
                <Link
                    href={href}
                    className={clsx(styles.item, active && styles.active)}
                    aria-current={active ? 'page' : undefined}
                    onClick={close}
                >
                    <Icon>{icon}</Icon>
                    <span className={styles.label}>{t(label)}</span>
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
                        <button
                            type="button"
                            className={styles.item}
                            onClick={() => {
                                expand();
                                close();
                            }}
                        >
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

'use client';

import clsx from 'clsx';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '../skeleton';
import { usePlaylistSelection } from './PlaylistSelection';
import styles from './PlaylistTabs.module.scss';

const skeletonWidths = [96, 72, 110];

export function PlaylistTabs() {
    const { t } = useTranslation();
    const { playlists, selected, select } = usePlaylistSelection();
    const listRef = useRef<HTMLDivElement>(null);
    const selectedId = selected?.id;

    useEffect(() => {
        listRef.current
            ?.querySelector('[aria-selected="true"]')
            ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }, [selectedId]);

    if (!playlists)
        return (
            <div className={styles.tabs}>
                {skeletonWidths.map((width, i) => (
                    <span key={i} className={styles.tab}>
                        <Skeleton width={width} />
                    </span>
                ))}
            </div>
        );

    return (
        <div ref={listRef} className={styles.tabs} role="tablist" aria-label={t('nav.playlists')}>
            {playlists.map(playlist => {
                const active = playlist.id === selectedId;
                return (
                    <button
                        key={playlist.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={clsx(styles.tab, active && styles.active)}
                        onClick={() => select(playlist.id)}
                    >
                        <span className={styles.label}>{playlist.name}</span>
                    </button>
                );
            })}
        </div>
    );
}

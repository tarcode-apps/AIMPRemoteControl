'use client';

import type { Playlist } from '@/app/_api/types';
import styles from './PlaylistPage.module.scss';

export type PlaylistPageProps = {
    playlist: Playlist;
};

export function PlaylistPage({ playlist }: PlaylistPageProps) {
    return (
        <section className={styles.page} aria-label={playlist.name}>
            <p className={styles.placeholder}>{playlist.name}</p>
        </section>
    );
}

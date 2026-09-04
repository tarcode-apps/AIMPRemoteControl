'use client';

import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { usePointerDrag } from '@/app/_hooks/usePointerDrag';
import { media } from '@/app/_styles/media';
import clsx from 'clsx';
import { useRef, type CSSProperties } from 'react';
import { PlaylistPage } from './PlaylistPage';
import styles from './PlaylistPager.module.scss';
import { usePlaylistSelection } from './PlaylistSelection';

const flingVelocity = 0.5;
const edgeResistance = 0.3;

export function PlaylistPager() {
    const paged = useMediaQuery(media.drawerModal);
    const { playlists, selected, select } = usePlaylistSelection();
    const trackRef = useRef<HTMLDivElement>(null);
    const width = useRef(0);
    const index = playlists && selected ? playlists.indexOf(selected) : -1;
    const last = playlists ? playlists.length - 1 : -1;

    const drag = usePointerDrag({
        axis: 'x',
        enabled: paged && index >= 0,
        onStart: () => {
            const track = trackRef.current;
            if (!track) return false;
            width.current = track.clientWidth;
        },
        onMove: delta => {
            const beyondEdge = (index === 0 && delta > 0) || (index === last && delta < 0);
            const offset = Math.min(Math.max(beyondEdge ? delta * edgeResistance : delta, -width.current), width.current);
            trackRef.current?.style.setProperty('--drag-x', `${offset}px`);
        },
        onRelease: ({ delta, velocity, cancelled }) => {
            if (cancelled || !playlists) return;
            const flung = Math.abs(velocity) > flingVelocity || Math.abs(delta) > width.current / 3;
            const target = Math.min(Math.max(index + (flung ? (delta < 0 ? 1 : -1) : 0), 0), last);
            if (target !== index) select(playlists[target].id);
        },
        onDragEnd: () => trackRef.current?.style.removeProperty('--drag-x'),
    });

    if (!paged) return <div className={styles.single}>{selected && <PlaylistPage playlist={selected} />}</div>;

    return (
        <div className={styles.pager} {...drag.handlers}>
            <div
                ref={trackRef}
                className={clsx(styles.track, drag.dragging && styles.dragging)}
                style={{ '--page-index': index } as CSSProperties}
            >
                {playlists?.map((playlist, i) => (
                    <div key={playlist.id} className={styles.pane}>
                        {Math.abs(i - index) <= 1 && <PlaylistPage playlist={playlist} />}
                    </div>
                ))}
            </div>
        </div>
    );
}

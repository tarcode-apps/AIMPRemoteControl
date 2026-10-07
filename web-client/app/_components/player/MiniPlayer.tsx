'use client';

import { usePlayer, usePlayerPosition, useSetPlayer } from '@/app/_api/player';
import { useTranslation } from 'react-i18next';
import { TrackCover } from '../cover';
import { Marquee } from './Marquee';
import styles from './MiniPlayer.module.scss';
import { PlayButton } from './PlayButton';
import { usePlayerPanel } from './PlayerPanel';
import { SeekBar } from './SeekBar';
import { SkipButton } from './SkipButton';

export type MiniPlayerProps = {
    onExpand(): void;
};

export function MiniPlayer({ onExpand }: MiniPlayerProps) {
    const { t } = useTranslation();
    const { expanded, docked } = usePlayerPanel();
    const { data: player } = usePlayer();
    const setPlayer = useSetPlayer();
    const shown = !expanded && !docked;
    const position = usePlayerPosition(player, shown);
    const track = player?.track ?? null;
    const duration = track ? (player?.duration ?? 0) : 0;

    return (
        <div className={styles.miniPlayer}>
            {/* Under everything: opens the player from wherever nothing else is. */}
            <button
                type="button"
                className={styles.expand}
                onClick={onExpand}
                title={t('player.expand')}
                aria-label={t('player.expand')}
            />
            <TrackCover hash={shown ? track?.coverHash : undefined} size={48} className={styles.cover} />
            <div className={styles.track}>
                {track && <Marquee className={styles.title}>{track.title}</Marquee>}
                {track?.artist && <span className={styles.artist}>{track.artist}</span>}
            </div>
            <div className={styles.controls}>
                <SkipButton direction="previous" />
                <PlayButton />
                <SkipButton direction="next" />
            </div>
            <SeekBar
                title={t('player.position')}
                className={styles.progress}
                value={position}
                max={duration}
                onCommit={value => setPlayer.mutate({ position: value })}
            />
        </div>
    );
}

'use client';

import { usePlayer, usePlayerCommand, usePlayerPosition, useSetPlayer } from '@/app/_api/player';
import { usePlaylists } from '@/app/_api/playlists';
import type { RepeatMode } from '@/app/_api/types';
import { formatDuration } from '@/app/_utils/format';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../buttons';
import { Icon } from '../icons';
import { Slider } from '../inputs';
import { useDrawer } from '../sidenav';
import { Marquee } from './Marquee';
import styles from './NowPlaying.module.scss';
import { PlayButton } from './PlayButton';
import { usePlayerPanel } from './PlayerPanel';
import { SkipButton } from './SkipButton';
import transport from './TransportButton.module.scss';

// Keeps the empty lines of the track block in place, so the cover does not resize.
const blank = '\u00A0';
const volumeInterval = 100;
const adjustingLabelTime = 2000;
const repeatCycle: Record<RepeatMode, RepeatMode> = { off: 'playlist', playlist: 'track', track: 'off' };

function volumeIcon(volume: number, mute: boolean) {
    if (mute) return 'volume_off';
    if (volume < 0.05) return 'volume_mute';
    return volume < 0.3 ? 'volume_down' : 'volume_up';
}

export function NowPlaying() {
    const { t } = useTranslation();
    const { open } = useDrawer();
    const { collapse, expanded, docked } = usePlayerPanel();
    const { data: player } = usePlayer();
    const { data: playlists } = usePlaylists();
    const command = usePlayerCommand();
    const setPlayer = useSetPlayer();
    const position = usePlayerPosition(player, expanded || docked);
    const volumeRef = useRef<HTMLDivElement>(null);
    const lastVolumeAt = useRef(0);
    const [volumeOpen, setVolumeOpen] = useState(false);
    // For a while after a change made here the slider, the icon and the label show
    // the values set here, and the title reads the level: the player's echoes of the
    // values sent while dragging would make them jitter, and the mute is written
    // before the prediction lands. Changes made in the player show through otherwise.
    const [adjusting, setAdjusting] = useState(false);
    const [adjusted, setAdjusted] = useState({ volume: 0, mute: false });
    const adjustingTimer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(adjustingTimer.current), []);
    const volume = adjusting ? adjusted.volume : (player?.volume ?? 0);
    const mute = adjusting ? adjusted.mute : (player?.mute ?? false);
    // The player reports 0 while muted and brings the volume back on unmute; the
    // slider does the same at once, from the last volume heard.
    const shownVolume = mute ? 0 : volume;
    const lastVolume = useRef(0);
    useEffect(() => {
        if (player && !player.mute) lastVolume.current = player.volume;
    }, [player]);
    const volumeLabel = t('player.volumeLevel', { percent: Math.round(shownVolume * 100) });
    const adjust = (values: { volume: number; mute: boolean }) => {
        setAdjusted(values);
        setAdjusting(true);
        window.clearTimeout(adjustingTimer.current);
        adjustingTimer.current = window.setTimeout(() => setAdjusting(false), adjustingLabelTime);
    };

    // Anything done outside the volume area puts it away.
    useEffect(() => {
        if (!volumeOpen) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!volumeRef.current?.contains(event.target as Node)) setVolumeOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setVolumeOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [volumeOpen]);
    const track = player?.track ?? null;
    const duration = player?.duration ?? 0;
    const repeat = player?.repeat ?? 'off';
    const count = track && playlists?.find(playlist => playlist.id === track.playlistId)?.itemCount;

    const setVolume = (value: number, commit: boolean) => {
        adjust({ volume: value, mute: false });
        const now = performance.now();
        if (!commit && now - lastVolumeAt.current < volumeInterval) return;
        lastVolumeAt.current = now;
        setPlayer.mutate(mute ? { volume: value, mute: false } : { volume: value });
    };

    const numbers = () => {
        if (!track || !count) return '';
        const number = track.trackNumber.split('/')[0].trim();
        const values = { number, position: track.index + 1, count };
        return t(number ? 'player.trackNumbers' : 'player.trackPosition', values);
    };

    return (
        <div className={styles.nowPlaying}>
            <header className={styles.header}>
                <IconButton title={t('nav.menu')} className={styles.nav} onClick={open}>
                    <Icon>menu</Icon>
                </IconButton>
                <div ref={volumeRef} className={styles.volumeArea}>
                    {volumeOpen && (
                        <div className={styles.volumePanel}>
                            <IconButton
                                title={t(mute ? 'player.unmute' : 'player.mute')}
                                className={clsx(styles.toggle, mute && styles.on)}
                                onClick={() => {
                                    adjust({ volume: mute ? lastVolume.current : volume, mute: !mute });
                                    setPlayer.mutate({ mute: !mute });
                                }}
                            >
                                <Icon>no_sound</Icon>
                            </IconButton>
                            <Slider
                                title={t('player.volume')}
                                value={shownVolume}
                                max={1}
                                step={0.01}
                                onChange={value => setVolume(value, false)}
                                onCommit={value => setVolume(value, true)}
                            />
                        </div>
                    )}
                    <IconButton
                        title={volumeLabel}
                        className={clsx(volumeOpen && styles.on)}
                        aria-expanded={volumeOpen}
                        onClick={() => setVolumeOpen(!volumeOpen)}
                    >
                        <Icon>{volumeIcon(shownVolume, mute)}</Icon>
                    </IconButton>
                </div>
                <IconButton title={t('player.collapse')} className={styles.collapse} onClick={collapse}>
                    <Icon>expand_more</Icon>
                </IconButton>
            </header>
            <div className={styles.cover}>
                <div className={styles.coverBox}>
                    <Icon>music_note</Icon>
                </div>
            </div>
            <div className={styles.track}>
                <h2 className={styles.title}>
                    <Marquee>{adjusting ? volumeLabel : (track?.title ?? blank)}</Marquee>
                </h2>
                <p className={styles.details}>{track?.artist || blank}</p>
                <p className={styles.details}>{track?.album || blank}</p>
            </div>
            <div className={styles.controls}>
                <IconButton
                    title={t('player.shuffle')}
                    className={clsx(styles.toggle, player?.shuffle && styles.on)}
                    onClick={() => player && setPlayer.mutate({ shuffle: !player.shuffle })}
                >
                    <Icon>shuffle</Icon>
                </IconButton>
                <SkipButton direction="previous" className={styles.wide} />
                {docked ? (
                    <>
                        <IconButton
                            title={t('player.stop')}
                            className={clsx(transport.button, styles.wide)}
                            onClick={() => command.mutate('stop')}
                        >
                            <Icon>stop</Icon>
                        </IconButton>
                        <IconButton
                            title={t('player.play')}
                            className={clsx(transport.button, styles.big)}
                            onClick={() => command.mutate('play')}
                        >
                            <Icon>play_arrow</Icon>
                        </IconButton>
                        <IconButton
                            title={t('player.pause')}
                            className={clsx(transport.button, styles.wide)}
                            onClick={() => command.mutate('pause')}
                        >
                            <Icon>pause</Icon>
                        </IconButton>
                    </>
                ) : (
                    <PlayButton className={styles.big} />
                )}
                <SkipButton direction="next" className={styles.wide} />
                <IconButton
                    title={t('player.repeat')}
                    className={clsx(styles.toggle, styles.repeat, repeat !== 'off' && styles.on)}
                    onClick={() => setPlayer.mutate({ repeat: repeatCycle[repeat] })}
                >
                    {/* The font has no crossed-out repeat, so the stroke is drawn over it. */}
                    <span className={clsx(styles.repeatIcon, repeat === 'off' && styles.struck)}>
                        <Icon>{repeat === 'track' ? 'repeat_one' : 'repeat'}</Icon>
                    </span>
                </IconButton>
            </div>
            <Slider
                title={t('player.position')}
                value={position}
                max={duration}
                onCommit={value => setPlayer.mutate({ position: value })}
            />
            <div className={styles.times}>
                <span>{track ? formatDuration(position) : t('player.noTime')}</span>
                <span>{numbers()}</span>
                <span>{track ? formatDuration(duration) : t('player.noTime')}</span>
            </div>
        </div>
    );
}

'use client';

import { useConnection } from '@/app/_api/helpers/connection';
import { usePlayer, usePlayerCommand, usePlayerPosition, useSetPlayer } from '@/app/_api/player';
import { usePlaylists, useSetItemMark } from '@/app/_api/playlists';
import type { PlayerCommand, PlayerPatch, RepeatMode } from '@/app/_api/types';
import { useElementSize } from '@/app/_hooks/useElementSize';
import { usePersistedState } from '@/app/_hooks/usePersistedState';
import { flingVelocity, usePointerDrag } from '@/app/_hooks/usePointerDrag';
import { useFavorites } from '@/app/_state/Favorites';
import { usePlaylistSelection } from '@/app/_state/PlaylistSelection';
import { useFavoriteActions } from '@/app/_state/useFavoriteActions';
import { useTrackActions } from '@/app/_state/useTrackActions';
import { formatDuration } from '@/app/_utils/format';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../buttons';
import { TrackCover } from '../cover';
import { Icon } from '../icons';
import { Slider } from '../inputs';
import { Menu, menuSeparator, type MenuEntry } from '../menus';
import { useItemRemoval, useTrackDownload } from '../playlists';
import { Rating } from '../rating';
import { useDrawer } from '../sidenav';
import { useErrorToast } from '../toast';
import { Lyrics } from './Lyrics';
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
// The lyrics get the room under the cover when it holds the six lines of 22px a
// small screen shows them on, in the title block's place, and the gap above them.
const lyricsRoom = 6 * 22 + 16;
// The pages slide the rest of the way at this pace, in px per ms, and for no
// less than the minimum: the further they have to go, the longer it takes.
const slideSpeed = 0.6;
const minSlideTime = 200;
const parseLyricsShown = (stored: unknown) => (typeof stored === 'boolean' ? stored : undefined);

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
    const setMark = useSetItemMark();
    // Every control here reports a refusal in the toast.
    const showError = useErrorToast();
    const { online } = useConnection();
    const runCommand = (name: PlayerCommand) => command.mutate(name, { onError: showError });
    const patchPlayer = (patch: PlayerPatch) => setPlayer.mutate(patch, { onError: showError });
    const markTrack = (playlistId: string, index: number, mark: number) =>
        setMark.mutate({ playlistId, index, mark }, { onError: showError });
    const shown = expanded || docked;
    const position = usePlayerPosition(player, shown);

    const favorites = useFavorites();
    const favoriteActions = useFavoriteActions();
    const trackActions = useTrackActions();
    const { showTrack } = usePlaylistSelection();
    // The favorite button and the track menu, only while a track is loaded.
    const playing = player?.track;
    const playingRef = playing && { ...playing, revision: playing.playlistRevision };
    const isFavorite = !!playing && favorites.has(playing.fileUri);
    const favoriteItem = playingRef && favoriteActions.favoriteMenuItem(playingRef);
    const removal = useItemRemoval();
    const download = useTrackDownload();

    // The lyrics are shown under the cover where there is room for them, and in
    // the title block's place, a swipe away, where there is not.
    const [lyricsShown, setLyricsShown] = usePersistedState('player.lyricsShown', false, parseLyricsShown);
    const coverArea = useRef<HTMLDivElement>(null);
    const area = useElementSize(coverArea);
    // The cover is a square of the area's shorter side.
    const roomy = area.height - Math.min(area.width, area.height) >= lyricsRoom;
    // The pages go round: a swipe either way brings the other page in from the
    // side the finger moves to. Both pages stay mounted and only move; the drag
    // and the side of the page out of view are written to the pager's style as
    // the pointer moves, so that the page coming in is there from the first frame.
    const pagerBox = useRef<HTMLDivElement>(null);
    const pageWidth = useRef(0);
    const dragOffset = (delta: number) => Math.min(Math.max(delta, -pageWidth.current), pageWidth.current);
    const pager = usePointerDrag({
        axis: 'x',
        enabled: !roomy && !!playing,
        onStart: () => {
            if (!pagerBox.current) return false;
            pageWidth.current = pagerBox.current.clientWidth;
        },
        onMove: delta => {
            const style = pagerBox.current?.style;
            style?.setProperty('--other-side', delta < 0 ? '1' : '-1');
            style?.setProperty('--drag-x', `${dragOffset(delta)}px`);
        },
        onRelease: ({ delta, velocity, cancelled }) => {
            const style = pagerBox.current?.style;
            if (!style) return;
            const width = pageWidth.current;
            const offset = Math.abs(dragOffset(delta));
            const flip = !cancelled && (Math.abs(velocity) > flingVelocity || Math.abs(delta) > width / 3);
            // The pages slide on from where the finger left them.
            const left = flip ? width - offset : offset;
            style.setProperty('--slide-time', `${Math.max(minSlideTime, left / slideSpeed)}ms`);
            style.removeProperty('--drag-x');
            if (!flip) return;
            // The page on its way out goes to the side opposite the one the new page came from.
            style.setProperty('--other-side', delta < 0 ? '-1' : '1');
            setLyricsShown(!lyricsShown);
        },
    });
    const lyricsItem: MenuEntry = {
        label: t(
            roomy
                ? lyricsShown
                    ? 'player.hideLyrics'
                    : 'player.showLyrics'
                : lyricsShown
                  ? 'player.trackTitle'
                  : 'player.lyrics',
        ),
        icon: !roomy && lyricsShown ? 'title' : 'article',
        onSelect: () => setLyricsShown(!lyricsShown),
    };

    const trackMenu: MenuEntry[] =
        playingRef && favoriteItem
            ? [
                  trackActions.infoItem(playingRef),
                  favoriteItem,
                  lyricsItem,
                  menuSeparator,
                  {
                      label: t('player.goToPlaylist'),
                      icon: 'queue_music',
                      onSelect: () => showTrack(playingRef),
                  },
                  menuSeparator,
                  ...removal.trackItems({ ...playingRef, name: playingRef.title }),
                  ...download.trackItems(playingRef),
              ]
            : [];

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
    // The player records only a stream; the button names its state while it can be used.
    const capturing = player?.radioCapture ?? false;
    const captureTitle = track?.isUrl
        ? `${t('player.radioCapture')} ${t(capturing ? 'player.stateOn' : 'player.stateOff')}`
        : t('player.radioCapture');
    const count = track && playlists?.find(playlist => playlist.id === track.playlistId)?.itemCount;

    const setVolume = (value: number, commit: boolean) => {
        adjust({ volume: value, mute: false });
        const now = performance.now();
        if (!commit && now - lastVolumeAt.current < volumeInterval) return;
        lastVolumeAt.current = now;
        patchPlayer(mute ? { volume: value, mute: false } : { volume: value });
    };

    const numbers = () => {
        if (!track || !count) return '';
        const number = track.trackNumber.split('/')[0].trim();
        const values = { number, position: track.index + 1, count };
        return t(number ? 'player.trackNumbers' : 'player.trackPosition', values);
    };

    const titleLines = (
        <>
            <h2 className={styles.title}>
                <Marquee>{adjusting ? volumeLabel : (track?.title ?? blank)}</Marquee>
            </h2>
            <p className={styles.details} data-testid="track-artist">
                {track?.artist || blank}
            </p>
            <p className={styles.details}>{track?.album || blank}</p>
        </>
    );

    return (
        <div className={styles.nowPlaying}>
            <header className={styles.header}>
                <IconButton title={t('nav.menu')} className={styles.nav} onClick={open}>
                    <Icon>menu</Icon>
                </IconButton>
                {track && !track.isUrl && !volumeOpen && (
                    <Rating
                        size="bar"
                        className={styles.rating}
                        mark={track.mark}
                        rating={track.rating}
                        displayingMark={track.displayingMark}
                        onChange={online ? mark => markTrack(track.playlistId, track.index, mark) : undefined}
                    />
                )}
                <div className={clsx(styles.actions, volumeOpen && styles.volumeOpen)}>
                    {!volumeOpen && (
                        <IconButton
                            title={captureTitle}
                            className={clsx(styles.capture, capturing && styles.capturing)}
                            aria-pressed={capturing}
                            disabled={!track?.isUrl || !online}
                            onClick={() => patchPlayer({ radioCapture: !capturing })}
                        >
                            <Icon>sensors</Icon>
                        </IconButton>
                    )}
                    <div ref={volumeRef} className={clsx(styles.volumeArea, volumeOpen && styles.volumeOpen)}>
                        {volumeOpen && (
                            <div className={styles.volumePanel}>
                                <IconButton
                                    title={t(mute ? 'player.unmute' : 'player.mute')}
                                    className={clsx(styles.toggle, mute && styles.on)}
                                    disabled={!online}
                                    onClick={() => {
                                        adjust({ volume: mute ? lastVolume.current : volume, mute: !mute });
                                        patchPlayer({ mute: !mute });
                                    }}
                                >
                                    <Icon>no_sound</Icon>
                                </IconButton>
                                <Slider
                                    title={t('player.volume')}
                                    value={shownVolume}
                                    max={1}
                                    step={0.01}
                                    disabled={!online}
                                    onChange={value => setVolume(value, false)}
                                    onCommit={value => setVolume(value, true)}
                                />
                            </div>
                        )}
                        <IconButton
                            title={volumeLabel}
                            className={clsx(volumeOpen && styles.on)}
                            aria-expanded={volumeOpen}
                            disabled={!online}
                            onClick={() => setVolumeOpen(!volumeOpen)}
                        >
                            <Icon>{volumeIcon(shownVolume, mute)}</Icon>
                        </IconButton>
                    </div>
                    <IconButton title={t('player.collapse')} className={styles.collapse} onClick={collapse}>
                        <Icon>expand_more</Icon>
                    </IconButton>
                </div>
            </header>
            <div ref={coverArea} className={styles.cover}>
                {/* Loaded while the sheet is closed too, so that it opens on the image rather than the placeholder. */}
                <TrackCover hash={track?.coverHash} className={clsx(styles.coverBox, !online && styles.offline)} />
                {roomy && lyricsShown && track && (
                    <Lyrics
                        className={styles.coverLyrics}
                        playlistId={track.playlistId}
                        fileUri={track.fileUri}
                        enabled
                    />
                )}
            </div>
            <div className={styles.track}>
                {favoriteItem ? (
                    <IconButton
                        title={favoriteItem.label}
                        className={clsx(styles.sideButton, styles.sideStart, isFavorite && styles.on)}
                        onClick={favoriteItem.onSelect}
                    >
                        <Icon className={clsx(!isFavorite && styles.unfilled)}>favorite</Icon>
                    </IconButton>
                ) : (
                    <span />
                )}
                <div className={styles.lines}>
                    {roomy ? (
                        titleLines
                    ) : (
                        <div
                            ref={pagerBox}
                            className={clsx(styles.pager, pager.dragging && styles.dragging)}
                            role="group"
                            aria-label={t('player.lyricsPages')}
                            {...pager.handlers}
                        >
                            <div
                                className={clsx(styles.page, lyricsShown ? styles.otherPage : styles.pageInView)}
                                aria-hidden={lyricsShown}
                            >
                                {titleLines}
                            </div>
                            <div
                                className={clsx(styles.page, lyricsShown ? styles.pageInView : styles.otherPage)}
                                aria-hidden={!lyricsShown}
                            >
                                {track && (
                                    <Lyrics
                                        playlistId={track.playlistId}
                                        fileUri={track.fileUri}
                                        enabled={lyricsShown || pager.dragging}
                                    />
                                )}
                            </div>
                        </div>
                    )}
                </div>
                {playing ? (
                    <Menu
                        title={t('player.trackMenu')}
                        icon="more_horiz"
                        items={trackMenu}
                        buttonClassName={clsx(styles.sideButton, styles.sideEnd)}
                    />
                ) : (
                    <span />
                )}
                {removal.dialogs}
                {download.dialogs}
            </div>
            <div className={styles.controls}>
                <IconButton
                    title={t('player.shuffle')}
                    className={clsx(styles.toggle, styles.sideButton, styles.sideStart, player?.shuffle && styles.on)}
                    disabled={!online}
                    onClick={() => player && patchPlayer({ shuffle: !player.shuffle })}
                >
                    <Icon>shuffle</Icon>
                </IconButton>
                <SkipButton direction="previous" className={styles.wide} />
                {docked ? (
                    <>
                        <IconButton
                            title={t('player.stop')}
                            disabled={!online}
                            className={clsx(transport.button, styles.wide)}
                            onClick={() => runCommand('stop')}
                        >
                            <Icon>stop</Icon>
                        </IconButton>
                        <IconButton
                            title={t('player.play')}
                            disabled={!online}
                            className={clsx(transport.button, styles.big)}
                            onClick={() => runCommand('play')}
                        >
                            <Icon>play_arrow</Icon>
                        </IconButton>
                        <IconButton
                            title={t('player.pause')}
                            disabled={!online}
                            className={clsx(transport.button, styles.wide)}
                            onClick={() => runCommand('pause')}
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
                    className={clsx(
                        styles.toggle,
                        styles.repeat,
                        styles.sideButton,
                        styles.sideEnd,
                        repeat !== 'off' && styles.on,
                    )}
                    disabled={!online}
                    onClick={() => patchPlayer({ repeat: repeatCycle[repeat] })}
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
                // A stream has no length to seek in.
                disabled={duration <= 0 || !online}
                onCommit={value => patchPlayer({ position: value })}
            />
            <div className={styles.times}>
                <span>{track ? formatDuration(position) : t('player.noTime')}</span>
                <span data-testid="track-position">{numbers()}</span>
                <span>{track ? formatDuration(duration) : t('player.noTime')}</span>
            </div>
        </div>
    );
}

'use client';

import { errorMessage } from '@/app/_api/helpers/errors';
import { positionOf, usePlayer, useSetPlayer, type PlayerSnapshot } from '@/app/_api/player';
import { useLyrics } from '@/app/_api/playlists';
import type { LyricsLine } from '@/app/_api/types';
import { useHoldInPlace } from '@/app/_hooks/useHold';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import clsx from 'clsx';
import { useEffect, useEffectEvent, useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorToast } from '../toast';
import styles from './Lyrics.module.scss';

// After the reader scrolls the lines, they stay where they are this long
// before the current line is followed again.
const followResumeDelay = 3000;
// How long the lines take to glide to the next current one.
const scrollDuration = 700;
// A press held on a line seeks to it; a finger that wanders further
// than the slop is scrolling.
const holdSlop = 8;
// The lines this many seconds ahead are highlighted, with the current one and those before it; the
// rest of the text is there in grey. Nothing is highlighted through an intro,
// then the first lines are, one by one, as in the player's own app.
const highlightAhead = 6;
const blank = '\u00A0';
const noLines: LyricsLine[] = [];

export type LyricsProps = {
    playlistId: string;
    fileUri: string;
    // Whether the lyrics may be asked for: the player may go to the internet.
    enabled: boolean;
    className?: string;
};

// The line being sung at `position`; -1 before the first.
function lineAt(lines: LyricsLine[], position: number): number {
    let index = -1;
    while (index + 1 < lines.length && (lines[index + 1].time ?? 0) <= position) index++;
    return index;
}

// Where the playback stands in the lines: the current one, -1 before the first,
// and how many are highlighted, which are the current one, those before it and
// those up to `highlightAhead` seconds away. A timer set to the next moment
// either changes re-renders then, from the position the player's state gives;
// a timer that fires late only delays that, since the lines are told from the
// position, never stepped through.
function useLyricsClock(
    player: PlayerSnapshot | undefined,
    lines: LyricsLine[],
): { current: number; highlighted: number } {
    const [now, setNow] = useState(() => performance.now());
    const playing = player?.state === 'playing';
    useEffect(() => {
        if (!playing || !player) return;
        let timer: number;
        const schedule = () => {
            const position = positionOf(player);
            let next = Infinity;
            for (const line of lines)
                for (const moment of [line.time ?? 0, (line.time ?? 0) - highlightAhead])
                    if (moment > position && moment < next) next = moment;
            if (next === Infinity) return;
            timer = window.setTimeout(
                () => {
                    setNow(performance.now());
                    schedule();
                },
                (next - position) * 1000,
            );
        };
        schedule();
        return () => window.clearTimeout(timer);
    }, [playing, player, lines]);
    const position = player ? positionOf(player, Math.max(now, player.receivedAt)) : -Infinity;
    return { current: lineAt(lines, position), highlighted: lineAt(lines, position + highlightAhead) + 1 };
}

// The lyrics of a track as the player's own window shows them: plain text to
// scroll through, or synced lines that follow the playback, the current one
// marked with an arrow and kept near the top. A double click or a hold on a
// line seeks to it.
export function Lyrics({ playlistId, fileUri, enabled, className }: LyricsProps) {
    const { t } = useTranslation();
    // The last track's lyrics stay through a track switch until the new ones come,
    // as the title lines do, rather than the page going blank in between.
    const { data: lyrics, error } = useLyrics(playlistId, fileUri, enabled, true);
    const { data: player } = usePlayer();
    const setPlayer = useSetPlayer();
    const showError = useErrorToast();
    const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
    const synced = lyrics?.type === 'synced';
    const lines = lyrics?.lines ?? noLines;
    // Followed out of view too, once read, so that the lines are in place when
    // they slide back in.
    const { current, highlighted } = useLyricsClock(synced ? player : undefined, lines);

    const box = useRef<HTMLDivElement>(null);
    const followedLines = useRef(noLines);
    const scrollFrame = useRef<number | undefined>(undefined);
    // Where the last scroll made here went, to tell its event from the reader's.
    const expected = useRef(-1);
    // When the reader last scrolled the lines, which then stand for a while; a
    // finger on them holds them for as long as it stays, and touches are tracked
    // by their own events, since the browser cancels the pointer once it scrolls.
    const [suspendedAt, setSuspendedAt] = useState(0);
    const held = useRef(false);

    const stopScrolling = () => {
        if (scrollFrame.current !== undefined) cancelAnimationFrame(scrollFrame.current);
        scrollFrame.current = undefined;
    };
    useEffect(() => stopScrolling, []);

    // Keeps the current line in the top quarter of the box, after the line before it
    // and as many more whole lines before it as fit there: one on a small
    // screen, more where the box is tall. The scroll eases out at its own pace,
    // slower than the browser's; a new text is shown at once.
    const follow = useEffectEvent(() => {
        const element = box.current;
        if (!element) return;
        const children = element.children as HTMLCollectionOf<HTMLElement>;
        let top = 0;
        if (current >= 0 && children[current]) {
            top = children[current].offsetTop;
            for (let before = current - 1; before >= 0; before--) {
                const above = children[current].offsetTop - children[before].offsetTop;
                if (before < current - 1 && above > element.clientHeight / 4) break;
                top = children[before].offsetTop;
            }
        }
        top = Math.min(top, element.scrollHeight - element.clientHeight);
        const jump = reducedMotion || followedLines.current !== lines;
        followedLines.current = lines;
        stopScrolling();
        const scrollTo = (position: number) => {
            expected.current = position;
            element.scrollTop = position;
        };
        if (jump) {
            scrollTo(top);
            return;
        }
        const from = element.scrollTop;
        const started = performance.now();
        const step = (now: number) => {
            const progress = Math.min(1, (now - started) / scrollDuration);
            scrollTo(from + (top - from) * (1 - Math.pow(1 - progress, 3)));
            scrollFrame.current = progress < 1 ? requestAnimationFrame(step) : undefined;
        };
        scrollFrame.current = requestAnimationFrame(step);
    });
    useEffect(() => {
        if (!suspendedAt) return;
        const timer = window.setTimeout(() => {
            if (!held.current) setSuspendedAt(0);
        }, followResumeDelay);
        return () => window.clearTimeout(timer);
    }, [suspendedAt]);
    useEffect(() => {
        if (synced && !suspendedAt) follow();
    }, [current, lines, synced, suspendedAt]);

    const suspend = () => {
        stopScrolling();
        setSuspendedAt(performance.now());
    };
    const press = () => {
        held.current = true;
        suspend();
    };
    const release = () => {
        if (!held.current) return;
        held.current = false;
        suspend();
    };
    const scrolled = () => {
        const element = box.current;
        if (!element || scrollFrame.current !== undefined || Math.abs(element.scrollTop - expected.current) < 1) return;
        suspend();
    };

    const seek = (line: LyricsLine) => {
        setSuspendedAt(0);
        setPlayer.mutate({ position: line.time ?? 0 }, { onError: showError });
    };

    const hold = useHoldInPlace(holdSlop);
    const pressLine = (event: PointerEvent, line: LyricsLine) => {
        if (event.button === 0) hold.start(event, () => seek(line));
    };

    if (error) return <p className={clsx(styles.note, className)}>{errorMessage(error, t)}</p>;
    if (!lyrics) return <div className={className} />;
    if (lyrics.type === 'none') return <p className={clsx(styles.note, className)}>{t('player.noLyrics')}</p>;
    return (
        <div
            ref={box}
            className={clsx(styles.lines, synced && styles.synced, className)}
            data-testid="lyrics"
            {...(synced && {
                onTouchStart: press,
                onTouchEnd: release,
                onTouchCancel: release,
                onPointerDown: (event: PointerEvent) => event.pointerType !== 'touch' && press(),
                onPointerUp: (event: PointerEvent) => event.pointerType !== 'touch' && release(),
                onPointerLeave: (event: PointerEvent) => event.pointerType !== 'touch' && release(),
                onWheel: suspend,
                onScroll: scrolled,
            })}
            onContextMenu={synced ? event => event.preventDefault() : undefined}
        >
            {lines.map((line, i) => (
                <p
                    key={i}
                    className={clsx(synced && i >= highlighted && styles.dimmed)}
                    data-testid="lyrics-line"
                    aria-current={synced && i === current ? 'true' : undefined}
                    {...(synced && {
                        onPointerDown: (event: PointerEvent) => pressLine(event, line),
                        onPointerMove: (event: PointerEvent) => hold.move(event),
                        onPointerUp: hold.cancel,
                        onPointerCancel: hold.cancel,
                        onPointerLeave: hold.cancel,
                        onDoubleClick: () => seek(line),
                    })}
                >
                    {synced && i === current && <span className={styles.arrow} />}
                    {line.text || blank}
                </p>
            ))}
        </div>
    );
}

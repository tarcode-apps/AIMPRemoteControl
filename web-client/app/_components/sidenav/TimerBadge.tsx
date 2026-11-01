'use client';

import { usePlayer } from '@/app/_api/player';
import { usePlaylists } from '@/app/_api/playlists';
import { useQueue } from '@/app/_api/queue';
import type { ActiveTimer, TimerAction } from '@/app/_api/types';
import { useRemaining } from '@/app/_hooks/useRemaining';
import { formatDuration } from '@/app/_utils/format';
import { useTranslation } from 'react-i18next';
import { Icon } from '../icons';
import styles from './TimerBadge.module.scss';

// The heaviest action is the one shown: the computer's over the player's over a pause.
const actionsByWeight: readonly TimerAction[] = [
    'shutdown',
    'reboot',
    'logOff',
    'hibernate',
    'sleep',
    'closePlayer',
    'pause',
];
const actionIcons: Record<TimerAction, string> = {
    shutdown: 'power_settings_new',
    reboot: 'restart_alt',
    logOff: 'logout',
    hibernate: 'bedtime',
    sleep: 'bedtime',
    closePlayer: 'close',
    pause: 'pause',
};
const triggerIcons = {
    playlistEnd: 'playlist_play',
    queueEnd: 'queue_music',
} as const;

const radius = 10;
const circumference = 2 * Math.PI * radius;
// Beyond this many tracks the gaps would vanish, so the ring runs down smoothly instead.
const maxSegments = 60;
const segmentGap = 2;

type Segments = {
    ended: number;
    left: number;
};

// An arc of the ring, `fraction` of it from the top, `offset` of the way round.
function Arc({ className, fraction, offset = 0 }: { className: string; fraction: number; offset?: number }) {
    const dash = circumference * fraction;
    return (
        <circle
            className={className}
            cx={12}
            cy={12}
            r={radius}
            style={{ strokeDasharray: `${dash} ${circumference - dash}`, strokeDashoffset: -circumference * offset }}
        />
    );
}

// One segment per track, the ended ones greyed out first.
function SegmentRing({ ended, left }: Segments) {
    const total = ended + left;
    if (total > maxSegments)
        return (
            <>
                <circle className={styles.track} cx={12} cy={12} r={radius} />
                <Arc className={styles.arc} fraction={left / total} offset={ended / total} />
            </>
        );
    const segment = 1 / total;
    const gap = total > 1 ? segmentGap / circumference : 0;
    return Array.from({ length: total }, (_, i) => (
        <Arc
            key={i}
            className={i < ended ? styles.done : styles.segment}
            fraction={segment - gap}
            offset={i * segment}
        />
    ));
}

export type TimerBadgeProps = {
    timer: ActiveTimer;
};

// A ring that runs down to the moment, with the action inside. A timer waiting
// for tracks to end has a segment per track and shows what it waits for.
export function TimerBadge({ timer }: TimerBadgeProps) {
    const { t, i18n } = useTranslation();
    const { data: queue } = useQueue();
    const { data: player } = usePlayer();
    const { data: playlists } = usePlaylists();
    const remaining = useRemaining(timer.expiresAt);
    const timed = timer.expiresAt !== undefined;
    const span = timer.expiresAt !== undefined && timer.setAt !== undefined ? timer.expiresAt - timer.setAt : 0;
    const fraction = span > 0 ? Math.min(1, remaining / span) : 1;
    const action = actionsByWeight.find(known => timer.actions.includes(known)) ?? timer.actions[0];

    // The tracks still to end follow the queue or the playlist as they grow or
    // shrink; the ended ones are the server's count since the timer was set.
    let left: number | undefined;
    if (timer.trigger === 'trackEnd') left = timer.tracksLeft;
    else if (timer.trigger === 'queueEnd') left = queue?.items.length;
    else if (timer.trigger === 'playlistEnd' && player?.track) {
        const count = playlists?.find(playlist => playlist.id === player.track?.playlistId)?.itemCount;
        if (count !== undefined) left = Math.max(1, count - player.track.index);
    }
    const ended = timer.tracksEnded ?? 0;
    const segments: Segments | undefined = left !== undefined && ended + left > 0 ? { ended, left } : undefined;

    let inside;
    if (timer.trigger === 'trackEnd') inside = <span className={styles.count}>{timer.tracksLeft}</span>;
    else if (timer.trigger === 'playlistEnd' || timer.trigger === 'queueEnd')
        inside = <Icon className={styles.icon}>{triggerIcons[timer.trigger]}</Icon>;
    else inside = <Icon className={styles.icon}>{actionIcons[action]}</Icon>;

    let ring;
    if (timed)
        ring = (
            <>
                <circle className={styles.track} cx={12} cy={12} r={radius} />
                <Arc className={styles.arc} fraction={fraction} />
            </>
        );
    else if (segments) ring = <SegmentRing {...segments} />;
    else ring = <circle className={styles.waiting} cx={12} cy={12} r={radius} />;

    const when = timed
        ? formatDuration(Math.ceil(remaining / 1000))
        : t(`timer.triggers.${timer.trigger}`) + (timer.trigger === 'trackEnd' ? ` (${timer.tracksLeft})` : '');
    const actions = new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(
        timer.actions.map(a => t(`timer.actions.${a}`)),
    );

    return (
        <span className={styles.badge} title={t('timer.badge', { when, actions })}>
            <svg className={styles.ring} viewBox="0 0 24 24" aria-hidden="true">
                {ring}
            </svg>
            {inside}
        </span>
    );
}

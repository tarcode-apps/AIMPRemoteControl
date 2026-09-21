'use client';

import { usePlayer, usePlayerCommand } from '@/app/_api/player';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../buttons';
import { Icon } from '../icons';
import styles from './TransportButton.module.scss';

const stopHoldDelay = 500;

// Play or pause on a tap, stop on a hold: the layouts without a stop button.
export function PlayButton({ className }: { className?: string }) {
    const { t } = useTranslation();
    const { data: player } = usePlayer();
    const command = usePlayerCommand();
    const playing = player?.state === 'playing';

    return (
        <IconButton
            title={t('player.holdToStop', { action: t(playing ? 'player.pause' : 'player.play') })}
            className={clsx(styles.button, className)}
            hold={{
                delay: stopHoldDelay,
                action: () => {
                    if (player && player.state !== 'stopped') command.mutate('stop');
                },
            }}
            onClick={() => command.mutate(playing ? 'pause' : 'play')}
        >
            <Icon>{playing ? 'pause' : 'play_arrow'}</Icon>
        </IconButton>
    );
}

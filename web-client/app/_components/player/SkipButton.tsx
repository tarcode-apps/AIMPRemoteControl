'use client';

import { usePlayerCommand, useSeekBy } from '@/app/_api/player';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../buttons';
import { Icon } from '../icons';
import styles from './TransportButton.module.scss';

const seekHoldDelay = 500;
const seekInterval = 500;
const seekStep = 10;

export type SkipButtonProps = {
    direction: 'next' | 'previous';
    className?: string;
};

// Switches the track on a tap, seeks in steps while held, as the player's buttons do.
export function SkipButton({ direction, className }: SkipButtonProps) {
    const { t } = useTranslation();
    const command = usePlayerCommand();
    const seekBy = useSeekBy();
    const step = direction === 'next' ? seekStep : -seekStep;

    return (
        <IconButton
            title={t('player.holdToSeek', { action: t(`player.${direction}`) })}
            className={clsx(styles.button, className)}
            hold={{ delay: seekHoldDelay, repeat: seekInterval, action: () => seekBy(step) }}
            onClick={() => command.mutate(direction)}
        >
            <Icon>{direction === 'next' ? 'skip_next' : 'skip_previous'}</Icon>
        </IconButton>
    );
}

'use client';

import { useTranslation } from 'react-i18next';
import { IconButton } from '../buttons';
import { Icon } from '../icons';
import styles from './MiniPlayer.module.scss';

export type MiniPlayerProps = {
    onExpand(): void;
};

export function MiniPlayer({ onExpand }: MiniPlayerProps) {
    const { t } = useTranslation();

    return (
        <div className={styles.miniPlayer}>
            <div className={styles.cover}>
                <Icon>music_note</Icon>
            </div>
            <button type="button" className={styles.track} onClick={onExpand} title={t('player.expand')}>
                <span className={styles.title}>{t('player.noTrack')}</span>
            </button>
            <div className={styles.controls}>
                <IconButton title={t('player.previous')} disabled>
                    <Icon>skip_previous</Icon>
                </IconButton>
                <IconButton title={t('player.play')} disabled>
                    <Icon>play_arrow</Icon>
                </IconButton>
                <IconButton title={t('player.next')} disabled>
                    <Icon>skip_next</Icon>
                </IconButton>
            </div>
        </div>
    );
}

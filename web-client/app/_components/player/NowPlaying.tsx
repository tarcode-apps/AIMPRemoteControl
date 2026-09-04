'use client';

import { useTranslation } from 'react-i18next';
import { IconButton } from '../buttons';
import { Icon } from '../icons';
import { useDrawer } from '../sidenav';
import styles from './NowPlaying.module.scss';
import { usePlayerPanel } from './PlayerPanel';

export function NowPlaying() {
    const { t } = useTranslation();
    const { open } = useDrawer();
    const { collapse } = usePlayerPanel();

    return (
        <div className={styles.nowPlaying}>
            <header className={styles.header}>
                <IconButton title={t('nav.menu')} className={styles.nav} onClick={open}>
                    <Icon>menu</Icon>
                </IconButton>
                <div className={styles.spacer} />
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
                <h2 className={styles.title}>{t('player.noTrack')}</h2>
            </div>
            <div className={styles.controls}>
                <IconButton title={t('player.shuffle')} disabled>
                    <Icon>shuffle</Icon>
                </IconButton>
                <IconButton title={t('player.previous')} disabled>
                    <Icon>skip_previous</Icon>
                </IconButton>
                <IconButton title={t('player.play')} className={styles.play} disabled>
                    <Icon>play_arrow</Icon>
                </IconButton>
                <IconButton title={t('player.next')} disabled>
                    <Icon>skip_next</Icon>
                </IconButton>
                <IconButton title={t('player.repeat')} disabled>
                    <Icon>repeat</Icon>
                </IconButton>
            </div>
            <div className={styles.timeline} />
        </div>
    );
}

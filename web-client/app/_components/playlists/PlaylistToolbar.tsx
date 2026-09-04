'use client';

import { useTranslation } from 'react-i18next';
import { IconButton } from '../buttons';
import { Icon } from '../icons';
import styles from './PlaylistToolbar.module.scss';

export function PlaylistToolbar() {
    const { t } = useTranslation();

    return (
        <div className={styles.toolbar}>
            <IconButton title={t('playlist.add')} disabled>
                <Icon>add</Icon>
            </IconButton>
            <IconButton title={t('playlist.select')} disabled>
                <Icon>checklist</Icon>
            </IconButton>
            <IconButton title={t('playlist.sort')} disabled>
                <Icon>sort</Icon>
            </IconButton>
            <IconButton title={t('playlist.search')} disabled>
                <Icon>search</Icon>
            </IconButton>
            <IconButton title={t('playlist.more')} disabled>
                <Icon>more_horiz</Icon>
            </IconButton>
        </div>
    );
}

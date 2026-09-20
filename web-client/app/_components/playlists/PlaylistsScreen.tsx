'use client';

import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { media } from '@/app/_styles/media';
import { formatDuration, formatSize } from '@/app/_utils/format';
import { useTranslation } from 'react-i18next';
import { SearchField } from '../inputs';
import { Screen } from '../pages';
import { PlaylistModeProvider, usePlaylistMode } from './PlaylistMode';
import { PlaylistPager } from './PlaylistPager';
import { usePlaylistSelection } from './PlaylistSelection';
import styles from './PlaylistsScreen.module.scss';
import { PlaylistTabs } from './PlaylistTabs';
import { PlaylistToolbar } from './PlaylistToolbar';

export function PlaylistsScreen() {
    return (
        <PlaylistModeProvider>
            <PlaylistsScreenContent />
        </PlaylistModeProvider>
    );
}

function PlaylistsScreenContent() {
    const { t, i18n } = useTranslation();
    const docked = useMediaQuery(media.drawerDocked);
    const { selected } = usePlaylistSelection();
    const mode = usePlaylistMode();
    const mobileSearch = !docked && mode.query !== null;

    return (
        <Screen
            title={selected?.name}
            subtitle={
                selected &&
                t('playlists.summary', {
                    count: selected.itemCount,
                    duration: formatDuration(selected.duration),
                    size: formatSize(selected.size, i18n.language),
                })
            }
            tabs={
                mobileSearch ? (
                    <SearchField
                        className={styles.search}
                        value={mode.query ?? ''}
                        autoFocus
                        onChange={mode.setQuery}
                        onClose={() => mode.setQuery(null)}
                    />
                ) : (
                    <PlaylistTabs />
                )
            }
            toolbar={<PlaylistToolbar />}
        >
            <PlaylistPager />
        </Screen>
    );
}

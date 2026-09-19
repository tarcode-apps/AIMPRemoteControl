'use client';

import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { media } from '@/app/_styles/media';
import { formatDuration, formatSize } from '@/app/_utils/format';
import { useTranslation } from 'react-i18next';
import { SearchField } from '../inputs';
import { Screen } from '../pages';
import { PlaylistPager } from './PlaylistPager';
import { PlaylistSearchProvider, usePlaylistSearch } from './PlaylistSearch';
import { usePlaylistSelection } from './PlaylistSelection';
import styles from './PlaylistsScreen.module.scss';
import { PlaylistTabs } from './PlaylistTabs';
import { PlaylistToolbar } from './PlaylistToolbar';

export function PlaylistsScreen() {
    return (
        <PlaylistSearchProvider>
            <PlaylistsScreenContent />
        </PlaylistSearchProvider>
    );
}

function PlaylistsScreenContent() {
    const { t, i18n } = useTranslation();
    const docked = useMediaQuery(media.drawerDocked);
    const { selected } = usePlaylistSelection();
    const search = usePlaylistSearch();
    const mobileSearch = !docked && search.query !== null;

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
                        value={search.query ?? ''}
                        autoFocus
                        onChange={search.setQuery}
                        onClose={() => search.setQuery(null)}
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

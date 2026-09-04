'use client';

import { useTranslation } from 'react-i18next';
import { Screen } from '../pages';
import { PlaylistPager } from './PlaylistPager';
import { usePlaylistSelection } from './PlaylistSelection';
import { PlaylistTabs } from './PlaylistTabs';
import { PlaylistToolbar } from './PlaylistToolbar';

export function PlaylistsScreen() {
    const { t } = useTranslation();
    const { selected } = usePlaylistSelection();

    return (
        <Screen
            title={selected?.name}
            subtitle={selected && t('playlists.tracks', { count: selected.entryCount })}
            tabs={<PlaylistTabs />}
            toolbar={<PlaylistToolbar />}
        >
            <PlaylistPager />
        </Screen>
    );
}

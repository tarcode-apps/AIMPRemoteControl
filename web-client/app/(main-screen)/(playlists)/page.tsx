'use client';

import { useSelectionSummary } from '@/app/_api/playlists';
import { useListHeading } from '@/app/_components/lists';
import { Screen } from '@/app/_components/pages';
import { usePlaylistSelection } from '@/app/_state/PlaylistSelection';
import { useTranslation } from 'react-i18next';
import { PlaylistModeProvider, usePlaylistMode } from './_components/PlaylistMode';
import { PlaylistPager } from './_components/PlaylistPager';
import { PlaylistTabs } from './_components/PlaylistTabs';
import { PlaylistToolbar } from './_components/PlaylistToolbar';

export default function Playlists() {
    return (
        <PlaylistModeProvider>
            <PlaylistsScreen />
        </PlaylistModeProvider>
    );
}

function PlaylistsScreen() {
    const { t } = useTranslation();
    const { selected } = usePlaylistSelection();
    const mode = usePlaylistMode();
    const summary = useSelectionSummary(selected?.id ?? '', selected && mode.itemSelection());
    const heading = useListHeading({
        mode,
        name: selected?.name,
        searchPlaceholder: t('playlist.searchPlaceholder'),
        totals: selected && { count: selected.itemCount, duration: selected.duration, size: selected.size },
        selectedTotals: summary.data,
    });

    // The tabs and the search field share the lower bar of a phone.
    return (
        <Screen
            title={heading.title}
            subtitle={heading.subtitle}
            onBack={heading.onBack}
            tabs={heading.search || <PlaylistTabs />}
            toolbar={<PlaylistToolbar />}
        >
            <PlaylistPager />
        </Screen>
    );
}

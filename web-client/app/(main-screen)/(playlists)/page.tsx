'use client';

import { useListHeading } from '@/app/_components/lists';
import { Screen } from '@/app/_components/pages';
import { usePlaylistSelection } from '@/app/_state/PlaylistSelection';
import { summaryOf } from '@/app/_utils/summary';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PlaylistModeProvider, usePlaylistMode } from './_components/PlaylistMode';
import { PlaylistPager } from './_components/PlaylistPager';
import { PlaylistTabs } from './_components/PlaylistTabs';
import { PlaylistToolbar } from './_components/PlaylistToolbar';
import { usePlaylistView } from './_components/usePlaylistLayout';

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
    const view = usePlaylistView(selected, mode.text);
    const groupTotals = useMemo(() => new Map(view.groups?.map(group => [group.index, group])), [view.groups]);
    const heading = useListHeading({
        mode,
        name: selected?.name,
        searchPlaceholder: t('playlist.searchPlaceholder'),
        totals: selected && { count: selected.itemCount, duration: selected.duration, size: selected.size },
        selectedTotals: mode.selectedTotals({
            all: view.totals,
            group: group => groupTotals.get(group),
            row: summaryOf,
        }),
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

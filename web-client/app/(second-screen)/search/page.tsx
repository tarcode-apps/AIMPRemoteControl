'use client';

import { useListHeading } from '@/app/_components/lists';
import { Screen } from '@/app/_components/pages';
import { useFavoriteRelink } from '@/app/_state/Favorites';
import { Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchModeProvider, useSearchMode } from './_components/SearchMode';
import { SearchPage } from './_components/SearchPage';
import { SearchToolbar } from './_components/SearchToolbar';

// The initial text comes from the address, which the static export only knows
// on the client.
export default function Search() {
    return (
        <Suspense>
            <SearchModeProvider>
                <SearchScreen />
            </SearchModeProvider>
        </Suspense>
    );
}

function SearchScreen() {
    const { t } = useTranslation();
    const mode = useSearchMode();
    const { result } = mode;
    const { relinking, finishRelink } = useFavoriteRelink();
    const heading = useListHeading({
        mode,
        name: t(relinking ? 'favorites.pickTitle' : 'search.title'),
        searchPlaceholder: t('search.placeholder'),
        totals: result && { count: result.total, duration: result.duration, size: result.size },
        selectedTotals: mode.selectionTotals,
        externalSearch: { value: mode.typed, onChange: mode.setTyped },
    });

    // A re-link that was not made is over once the screen is left.
    useEffect(() => finishRelink, [finishRelink]);

    return (
        <Screen {...heading} toolbar={<SearchToolbar />} player={!relinking}>
            <SearchPage />
        </Screen>
    );
}

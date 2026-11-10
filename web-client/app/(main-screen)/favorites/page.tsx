'use client';

import { useListHeading } from '@/app/_components/lists';
import { Screen } from '@/app/_components/pages';
import { useTranslation } from 'react-i18next';
import { FavoritesModeProvider, totalsOf, useFavoritesMode } from './_components/FavoritesMode';
import { FavoritesPage } from './_components/FavoritesPage';
import { FavoritesToolbar } from './_components/FavoritesToolbar';

export default function Favorites() {
    return (
        <FavoritesModeProvider>
            <FavoritesScreen />
        </FavoritesModeProvider>
    );
}

function FavoritesScreen() {
    const { t } = useTranslation();
    const mode = useFavoritesMode();
    const heading = useListHeading({
        mode,
        name: t('screens.favorites'),
        searchPlaceholder: t('favorites.searchPlaceholder'),
        totals: totalsOf(mode.entries),
        selectedTotals: totalsOf(mode.selectedEntries()),
    });

    return (
        <Screen {...heading} toolbar={<FavoritesToolbar />}>
            <FavoritesPage />
        </Screen>
    );
}

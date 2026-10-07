'use client';

import type { ItemsSummary } from '@/app/_api/types';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { media } from '@/app/_styles/media';
import { formatDuration, formatSize } from '@/app/_utils/format';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchField } from '../inputs';
import type { ListModeValue } from './ListMode';
import styles from './useListHeading.module.scss';

export type ListHeadingOptions = {
    mode: ListModeValue;
    name: string | undefined;
    searchPlaceholder: string;
    totals: ItemsSummary | undefined;
    // Of the selected items; asked for only while something is selected.
    selectedTotals: ItemsSummary | undefined;
};

export type ListHeading = {
    title: string | undefined;
    subtitle: string | undefined;
    onBack: (() => void) | undefined;
    // The search field that stands in for the heading on a phone.
    search: ReactNode;
};

const nothing: ItemsSummary = { count: 0, duration: 0, size: 0 };

// The app bar of a list: its name and totals, or, while selecting, the selection
// and its totals, which start from zero.
export function useListHeading({
    mode,
    name,
    searchPlaceholder,
    totals,
    selectedTotals,
}: ListHeadingOptions): ListHeading {
    const { t, i18n } = useTranslation();
    const docked = useMediaQuery(media.drawerDocked);
    const mobileSearch = !docked && mode.query !== null;
    const shown = mode.selecting && !mode.nothingSelected ? selectedTotals : mode.mode === 'select' ? nothing : totals;

    return {
        title: mode.mode === 'select' ? t('selection.title') : name,
        subtitle:
            shown &&
            t('playlists.summary', {
                count: shown.count,
                duration: formatDuration(shown.duration),
                size: formatSize(shown.size, i18n.language),
            }),
        onBack: mobileSearch ? () => mode.setQuery(null) : undefined,
        search: mobileSearch && (
            <SearchField
                className={styles.search}
                placeholder={searchPlaceholder}
                value={mode.query ?? ''}
                autoFocus
                onChange={mode.setQuery}
                onClose={() => mode.setQuery(null)}
            />
        ),
    };
}

'use client';

import { useLocatedFavorites } from '@/app/_api/favorites';
import { usePlaylists } from '@/app/_api/playlists';
import type { ItemsSummary, LocatedItem, PlaylistGroup } from '@/app/_api/types';
import { PlaylistRows, useCollapsedGroups, useListMode, type ListModeValue } from '@/app/_components/lists';
import { useFavorites, type FavoriteRecord } from '@/app/_state/Favorites';
import { sumSummaries } from '@/app/_utils/summary';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// A favorite as the list shows it: the record, and the track in its playlist
// when it is still there.
export type FavoriteEntry = {
    record: FavoriteRecord;
    located: LocatedItem | undefined;
};

export type FavoritesModeContextValue = ListModeValue & {
    // The entries the list shows, by position: everything, or the search's matches.
    entries: FavoriteEntry[];
    // The entries in groups by the chosen field: runs of neighbours that share it.
    rows: PlaylistRows;
    toggleGroup(group: PlaylistGroup): void;
    setAllExpanded(expanded: boolean): void;
    selectedEntries(): FavoriteEntry[];
};

const FavoritesModeContext = createContext<FavoritesModeContextValue | null>(null);

export function useFavoritesMode(): FavoritesModeContextValue {
    const value = useContext(FavoritesModeContext);
    if (!value) throw new Error('useFavoritesMode must be used inside <FavoritesModeProvider>');
    return value;
}

// The live values of the tracks still in their playlists, the snapshots of the rest.
export function totalsOf(entries: FavoriteEntry[]): ItemsSummary {
    return sumSummaries(
        entries.map(({ record, located }) => {
            const { duration, size } = located ?? record;
            return { count: 1, duration, size };
        }),
    );
}

export function FavoritesModeProvider({ children }: { children: ReactNode }) {
    const { t } = useTranslation();
    const list = useListMode('favorites');
    const { records, grouping, revision } = useFavorites();
    // The selection names entries by position, which any change of the favorites
    // may move, an addition from the player included.
    const [seenRevision, setSeenRevision] = useState(revision);
    if (seenRevision !== revision) {
        setSeenRevision(revision);
        list.clearSelection();
    }
    const { data: located } = useLocatedFavorites(records);
    const { data: playlists } = usePlaylists();
    const { text } = list;

    const entries = useMemo(() => {
        const needle = text.toLowerCase();
        const matches = (record: FavoriteRecord) =>
            !needle ||
            [record.displayText, record.secondLine, record.artist, record.album, record.playlistName].some(field =>
                field.toLowerCase().includes(needle),
            );
        return records
            .filter(matches)
            .map((record): FavoriteEntry => ({ record, located: located?.get(record.fileUri) }));
    }, [records, located, text]);

    const { collapsed, toggle, setAll } = useCollapsedGroups();
    const { groups, keys } = useMemo(() => {
        const names = new Map(playlists?.map(playlist => [playlist.id, playlist.name]));
        // The group of an entry: its key, which the folding is kept by, and its name.
        const groupOf = (record: FavoriteRecord): [string, string] => {
            if (grouping === 'playlist')
                return [record.playlistId, names.get(record.playlistId) || record.playlistName];
            const value = record[grouping];
            return [value, value || t('favorites.noValue')];
        };
        const groups: PlaylistGroup[] = [];
        const keys: string[] = [];
        entries.forEach(({ record }, position) => {
            const [key, name] = groupOf(record);
            const last = groups.at(-1);
            if (last && keys.at(-1) === key) {
                last.count++;
                return;
            }
            keys.push(key);
            groups.push({
                index: groups.length,
                name,
                count: 1,
                duration: 0,
                size: 0,
                expanded: !collapsed.has(key),
                firstPosition: position,
            });
        });
        return { groups, keys };
    }, [entries, grouping, playlists, collapsed, t]);
    const rows = useMemo(() => new PlaylistRows(entries.length, groups), [entries.length, groups]);

    const value: FavoritesModeContextValue = {
        ...list,
        entries,
        rows,
        toggleGroup: group => toggle(keys[group.index]),
        setAllExpanded: expanded => setAll(expanded, keys),
        selectedEntries: () => entries.filter((_, position) => list.isSelected(position)),
    };
    return <FavoritesModeContext value={value}>{children}</FavoritesModeContext>;
}

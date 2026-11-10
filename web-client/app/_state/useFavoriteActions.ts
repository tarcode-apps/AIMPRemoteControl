'use client';

import { selectionOfTracks, useItemDetails, type TrackRef } from '@/app/_api/items';
import { usePlaylists } from '@/app/_api/playlists';
import type { ItemsSelection } from '@/app/_api/types';
import type { MenuItem } from '@/app/_components/menus';
import { useErrorToast } from '@/app/_components/toast';
import { useTranslation } from 'react-i18next';
import { toRecord, useFavorites, type FavoriteRecord } from './Favorites';

export function useFavoriteActions() {
    const { t } = useTranslation();
    const showError = useErrorToast();
    const favorites = useFavorites();
    const details = useItemDetails();
    const { data: playlists } = usePlaylists();

    // One request for the whole selection, so that the favorites change once and
    // keep the order of its playlists.
    const recordsOf = async (selection: ItemsSelection): Promise<FavoriteRecord[]> => {
        const { items } = await details.mutateAsync(selection);
        const names = new Map(playlists?.map(playlist => [playlist.id, playlist.name]));
        return items.map(item => toRecord(item, item.playlistId, names.get(item.playlistId) ?? ''));
    };

    const addSelection = async (selection: ItemsSelection) => favorites.add(await recordsOf(selection));

    return {
        addSelection,
        // The track takes the place of the favorite whose file is gone.
        async relink(fileUri: string, track: TrackRef) {
            const [record] = await recordsOf(selectionOfTracks([track]));
            if (record) favorites.replace(fileUri, record);
        },
        // Adds the track, or takes it out when it is there already.
        favoriteMenuItem: (track: TrackRef & { fileUri: string }): MenuItem =>
            favorites.has(track.fileUri)
                ? {
                      label: t('favorites.remove'),
                      icon: 'heart_minus',
                      onSelect: () => favorites.remove([track.fileUri]),
                  }
                : {
                      label: t('favorites.add'),
                      icon: 'heart_plus',
                      onSelect: () => void addSelection(selectionOfTracks([track])).catch(showError),
                  },
    };
}

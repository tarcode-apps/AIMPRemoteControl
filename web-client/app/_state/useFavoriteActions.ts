'use client';

import { useItemDetails, usePlaylists } from '@/app/_api/playlists';
import type { SelectionInPlaylist } from '@/app/_api/types';
import type { MenuItem } from '@/app/_components/menus';
import { useTranslation } from 'react-i18next';
import { toRecord, useFavorites, type FavoriteRecord } from './Favorites';
import type { TrackRef } from './useTrackActions';

export function useFavoriteActions() {
    const { t } = useTranslation();
    const favorites = useFavorites();
    const details = useItemDetails();
    const { data: playlists } = usePlaylists();

    const recordsOf = async ({ playlistId, revision, selection }: SelectionInPlaylist): Promise<FavoriteRecord[]> => {
        const { items } = await details.mutateAsync({ playlistId, revision, ...selection });
        const playlistName = playlists?.find(playlist => playlist.id === playlistId)?.name ?? '';
        return items.map(item => toRecord(item, playlistId, playlistName));
    };

    // All the parts are read before anything is added, so that the favorites
    // change once and keep the order of the parts.
    const addSelections = async (parts: SelectionInPlaylist[]) =>
        favorites.add((await Promise.all(parts.map(recordsOf))).flat());

    return {
        addSelections,
        // The track takes the place of the favorite whose file is gone.
        async relink(fileUri: string, { playlistId, index, revision }: TrackRef) {
            const [record] = await recordsOf({ playlistId, revision, selection: { indexes: [index] } });
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
                      onSelect: () =>
                          void addSelections([
                              {
                                  playlistId: track.playlistId,
                                  revision: track.revision,
                                  selection: { indexes: [track.index] },
                              },
                          ]),
                  },
    };
}

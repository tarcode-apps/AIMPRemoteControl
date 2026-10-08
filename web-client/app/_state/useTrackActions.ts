'use client';

import { usePlayTrack } from '@/app/_api/player';
import { useEnqueue } from '@/app/_api/queue';
import type { MenuItem } from '@/app/_components/menus';
import { useTranslation } from 'react-i18next';
import { usePlaylistSelection } from './PlaylistSelection';

// A track of some playlist, at the revision its index belongs to.
export type TrackRef = {
    playlistId: string;
    index: number;
    revision?: number;
};

export function useTrackActions() {
    const { t } = useTranslation();
    const enqueue = useEnqueue();
    const playTrack = usePlayTrack();
    const { goToTrack, showTrack } = usePlaylistSelection();

    return {
        // From a screen other than its playlist: the playlist opens on it later.
        play(track: TrackRef) {
            playTrack.mutate(track);
            goToTrack(track);
        },
        enqueueItems: ({ playlistId, index, revision }: TrackRef): MenuItem[] => {
            const enqueueTrack = (atBeginning: boolean) =>
                enqueue.mutate({ playlistId, indexes: [index], atBeginning, revision });
            return [
                { label: t('playlist.enqueue'), icon: 'playlist_add', onSelect: () => enqueueTrack(false) },
                { label: t('playlist.enqueueFirst'), icon: 'playlist_play', onSelect: () => enqueueTrack(true) },
            ];
        },
        showItem: (track: TrackRef): MenuItem => ({
            label: t('playlist.goToTrack'),
            icon: 'my_location',
            onSelect: () => showTrack(track),
        }),
    };
}

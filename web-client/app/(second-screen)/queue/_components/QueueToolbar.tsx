'use client';

import { groupByPlaylist, usePlaylists } from '@/app/_api/playlists';
import { useClearQueue, useQueue, useRemoveFromQueue, useSetQueueSuspended } from '@/app/_api/queue';
import { ToolbarButton } from '@/app/_components/buttons';
import { Icon } from '@/app/_components/icons';
import { ListToolbar } from '@/app/_components/lists';
import { useFavoriteActions } from '@/app/_state/useFavoriteActions';
import { useTranslation } from 'react-i18next';
import { useQueueMode } from './QueueMode';

export function QueueToolbar() {
    const { t } = useTranslation();
    const mode = useQueueMode();
    const { data: queue } = useQueue();
    const { data: playlists } = usePlaylists();
    const suspend = useSetQueueSuspended();
    const clear = useClearQueue();
    const remove = useRemoveFromQueue();
    const favoriteActions = useFavoriteActions();

    const addSelectedToFavorites = () => {
        const revisions = new Map(playlists?.map(playlist => [playlist.id, playlist.revision]));
        const selected = mode.items.filter(item => mode.isSelected(item.position));
        return favoriteActions.addSelections(
            [...groupByPlaylist(selected)].map(([playlistId, items]) => ({
                playlistId,
                revision: revisions.get(playlistId),
                selection: { indexes: items.map(item => item.index) },
            })),
        );
    };

    const removeSelected = () => {
        const positions = mode.items.filter(item => mode.isSelected(item.position)).map(item => item.position);
        if (positions.length) remove.mutate({ positions, revision: queue?.revision });
        // The positions renumber, so the selection cannot stay.
        if (mode.mode === 'select') mode.setMode(null);
        else mode.clearSelection();
    };

    return (
        <ListToolbar
            mode={mode}
            searchPlaceholder={t('queue.searchPlaceholder')}
            idle={
                <>
                    <span />
                    <ToolbarButton
                        title={t('playlist.select')}
                        disabled={mode.items.length === 0}
                        onClick={() => mode.setMode('select')}
                    >
                        <Icon>checklist</Icon>
                    </ToolbarButton>
                    <span />
                </>
            }
            moreActions={[
                {
                    label: t(queue?.suspended ? 'queue.resume' : 'queue.suspend'),
                    icon: queue?.suspended ? 'play_circle' : 'pause_circle',
                    disabled: !queue,
                    onSelect: () => suspend.mutate(!queue?.suspended),
                },
                {
                    label: t('queue.clear'),
                    icon: 'delete_sweep',
                    disabled: !queue?.items.length,
                    onSelect: () => clear.mutate(queue?.revision),
                },
            ]}
            selectedActions={[
                {
                    label: t('favorites.add'),
                    icon: 'heart_plus',
                    disabled: mode.nothingSelected,
                    onSelect: () => void addSelectedToFavorites(),
                },
                { label: t('queue.remove'), icon: 'delete', disabled: mode.nothingSelected, onSelect: removeSelected },
            ]}
        />
    );
}

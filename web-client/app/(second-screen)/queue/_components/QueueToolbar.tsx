'use client';

import { selectionOfTracks } from '@/app/_api/items';
import { usePlaylists } from '@/app/_api/playlists';
import { useClearQueue, useQueue, useSetQueueSuspended } from '@/app/_api/queue';
import { ToolbarButton } from '@/app/_components/buttons';
import { Icon } from '@/app/_components/icons';
import { ListToolbar } from '@/app/_components/lists';
import { useErrorToast } from '@/app/_components/toast';
import { useFavoriteActions } from '@/app/_state/useFavoriteActions';
import { useTranslation } from 'react-i18next';
import { useQueueMode } from './QueueMode';

export function QueueToolbar() {
    const { t } = useTranslation();
    const showError = useErrorToast();
    const mode = useQueueMode();
    const { data: queue } = useQueue();
    const { data: playlists } = usePlaylists();
    const suspend = useSetQueueSuspended();
    const clear = useClearQueue();
    const favoriteActions = useFavoriteActions();
    const selected = mode.selectedItems();

    const addSelectedToFavorites = () => {
        const revisions = new Map(playlists?.map(playlist => [playlist.id, playlist.revision]));
        return favoriteActions.addSelection(
            selectionOfTracks(selected.map(item => ({ ...item, revision: revisions.get(item.playlistId) }))),
        );
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
                    onSelect: () => suspend.mutate(!queue?.suspended, { onError: showError }),
                },
                {
                    label: t('queue.clear'),
                    icon: 'delete_sweep',
                    disabled: !queue?.items.length,
                    onSelect: () => clear.mutate(queue?.revision, { onError: showError }),
                },
            ]}
            selectedActions={[
                {
                    label: t('favorites.add'),
                    icon: 'heart_plus',
                    disabled: mode.nothingSelected,
                    onSelect: () => void addSelectedToFavorites().catch(showError),
                },
                {
                    label: t('queue.remove'),
                    icon: 'delete',
                    disabled: mode.nothingSelected,
                    onSelect: () => mode.removeFromQueue(selected),
                },
            ]}
        />
    );
}

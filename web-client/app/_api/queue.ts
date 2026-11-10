import { useMutation, useQuery } from '@tanstack/react-query';
import { useOptimisticMutation } from './helpers/optimistic';
import { request } from './helpers/request';
import type { EnqueueRequest, Queue, QueueMoveRequest, QueueRemoveRequest } from './types';

export const queueKeys = {
    all: ['queue'] as const,
};

export function useQueue() {
    return useQuery({
        queryKey: queueKeys.all,
        queryFn: ({ signal }) => request<Queue>('GET', '/queue', { signal }),
    });
}

export function trackKey(playlistId: string, index: number) {
    return `${playlistId}/${index}`;
}

// The queue positions of each track, by `trackKey`, for the marks in the playlists.
export function useQueuePositions(): ReadonlyMap<string, number[]> {
    const { data } = useQueue();
    const positions = new Map<string, number[]>();
    for (const item of data?.items ?? []) {
        const key = trackKey(item.playlistId, item.index);
        const known = positions.get(key);
        if (known) known.push(item.position);
        else positions.set(key, [item.position]);
    }
    return positions;
}

// The mark a track carries in a playlist: its first position in the queue, with a
// plus when it is queued more than once; nothing when it is not queued.
export function queueMark(positions: number[] | undefined): string | undefined {
    if (!positions?.length) return undefined;
    return `[${positions[0] + 1}${positions.length > 1 ? '+' : ''}]`;
}

export function useEnqueue() {
    return useMutation({
        mutationFn: (body: EnqueueRequest) => request<unknown>('POST', '/queue/items', { body }),
    });
}

function renumbered(items: Queue['items']) {
    return items.map((item, position) => (item.position === position ? item : { ...item, position }));
}

export function useRemoveFromQueue() {
    return useOptimisticMutation<Queue, QueueRemoveRequest>(
        queueKeys.all,
        body => request<unknown>('POST', '/queue/remove', { body }),
        (queue, { positions }) => {
            const removed = new Set(positions);
            return { ...queue, items: renumbered(queue.items.filter(item => !removed.has(item.position))) };
        },
    );
}

// Not predicted: the dragged row stays in its slot until the `queue` event brings
// the new order, as in the playlists.
export function useMoveQueueItems() {
    return useMutation({
        mutationFn: (body: QueueMoveRequest) => request<unknown>('POST', '/queue/move', { body }),
    });
}

export function useClearQueue() {
    return useOptimisticMutation<Queue, number | undefined>(
        queueKeys.all,
        revision => request<unknown>('DELETE', '/queue', { body: { revision } }),
        queue => ({ ...queue, items: [] }),
    );
}

export function useSetQueueSuspended() {
    return useOptimisticMutation<Queue, boolean>(
        queueKeys.all,
        suspended => request<unknown>('PATCH', '/queue', { body: { suspended } }),
        (queue, suspended) => ({ ...queue, suspended }),
    );
}

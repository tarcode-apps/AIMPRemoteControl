import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOptimisticMutation } from './helpers/optimistic';
import { request } from './helpers/request';
import type { SetTimerRequest, TimerState } from './types';

export const timerKeys = {
    all: ['timer'] as const,
};

// Read with the permission only: without it the player refuses.
export function useTimer(enabled: boolean) {
    return useQuery({
        queryKey: timerKeys.all,
        queryFn: ({ signal }) => request<TimerState>('GET', '/timer', { signal }),
        enabled,
    });
}

// The answer is the new state; the `timer` event brings the same a moment later.
export function useSetTimer() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: SetTimerRequest) => request<TimerState>('PUT', '/timer', { body }),
        onSuccess: state => client.setQueryData(timerKeys.all, state),
    });
}

export function useCancelTimer() {
    return useOptimisticMutation<TimerState, void>(
        timerKeys.all,
        () => request<unknown>('DELETE', '/timer'),
        state => ({ ...state, timer: null }),
    );
}

import { useQuery } from '@tanstack/react-query';
import { request } from './helpers/request';
import type { Settings } from './types';

export const settingsKeys = {
    all: ['settings'] as const,
};

// The plugin's settings as far as the client may know them; the `settings` event
// tells of a change.
export function useSettings() {
    return useQuery({
        queryKey: settingsKeys.all,
        queryFn: ({ signal }) => request<Settings>('GET', '/settings', { signal }),
    });
}

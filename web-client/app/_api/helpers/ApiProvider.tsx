'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { isConnectionError } from './errors';
import { useEventStream } from './events';

export function ApiProvider({ children }: { children: ReactNode }) {
    const [client] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    // Without the player a query waits for it rather than failing; the
                    // connection state tells React Query, see connection.ts.
                    queries: {
                        staleTime: Infinity,
                        retry: (failureCount, error) => isConnectionError(error) && failureCount < 3,
                    },
                    // A command fails at once: run when the player is back, it would
                    // be one the user no longer means.
                    mutations: {
                        networkMode: 'always',
                    },
                },
            }),
    );
    useEventStream(client);
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

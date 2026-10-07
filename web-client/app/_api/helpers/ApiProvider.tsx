'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { NetworkError } from './errors';
import { useEventStream } from './events';

export function ApiProvider({ children }: { children: ReactNode }) {
    const [client] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: Infinity,
                        retry: (failureCount, error) => error instanceof NetworkError && failureCount < 3,
                    },
                },
            }),
    );
    useEventStream(client);
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

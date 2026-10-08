'use client';

import { useQueue } from '@/app/_api/queue';
import type { QueueItem } from '@/app/_api/types';
import { useListMode, type ListModeValue } from '@/app/_components/lists';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type QueueModeContextValue = ListModeValue & {
    // The items the list shows: the whole queue, or the search's matches.
    items: QueueItem[];
};

const QueueModeContext = createContext<QueueModeContextValue | null>(null);

export function useQueueMode(): QueueModeContextValue {
    const value = useContext(QueueModeContext);
    if (!value) throw new Error('useQueueMode must be used inside <QueueModeProvider>');
    return value;
}

export function QueueModeProvider({ children }: { children: ReactNode }) {
    const list = useListMode('queue');
    const { data } = useQueue();
    // The selection names entries by position, which the player moves as it plays.
    const [revision, setRevision] = useState(data?.revision);
    if (revision !== data?.revision) {
        setRevision(data?.revision);
        list.clearSelection();
    }
    const all = data?.items;
    const { text } = list;
    // The queue is small and loaded whole, so the search runs on the client.
    const items = useMemo(() => {
        if (!all) return [];
        if (!text) return all;
        const needle = text.toLowerCase();
        return all.filter(
            item => item.displayText.toLowerCase().includes(needle) || item.secondLine.toLowerCase().includes(needle),
        );
    }, [all, text]);
    return <QueueModeContext value={{ ...list, items }}>{children}</QueueModeContext>;
}

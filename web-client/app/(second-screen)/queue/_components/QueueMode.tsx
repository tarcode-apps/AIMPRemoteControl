'use client';

import { useQueue, useRemoveFromQueue } from '@/app/_api/queue';
import type { QueueItem } from '@/app/_api/types';
import { useListMode, type ListModeValue } from '@/app/_components/lists';
import { useErrorToast } from '@/app/_components/toast';
import { useOnChange } from '@/app/_hooks/useOnChange';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

export type QueueModeContextValue = ListModeValue & {
    // The items the list shows: the whole queue, or the search's matches.
    items: QueueItem[];
    selectedItems(): QueueItem[];
    // Takes the items out of the queue, and the selection with them, as the
    // positions renumber; the mode stays for the next pick. The menu items and the
    // Delete key share it.
    removeFromQueue(items: QueueItem[]): void;
};

const QueueModeContext = createContext<QueueModeContextValue | null>(null);

export function useQueueMode(): QueueModeContextValue {
    const value = useContext(QueueModeContext);
    if (!value) throw new Error('useQueueMode must be used inside <QueueModeProvider>');
    return value;
}

export function QueueModeProvider({ children }: { children: ReactNode }) {
    const showError = useErrorToast();
    const list = useListMode('queue');
    const { data } = useQueue();
    const remove = useRemoveFromQueue();
    // The selection names the items shown by position, which the player moves as
    // it plays.
    useOnChange(data?.revision, list.clearSelection);
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

    const value: QueueModeContextValue = {
        ...list,
        items,
        selectedItems: () => items.filter((_, position) => list.isSelected(position)),
        removeFromQueue: removed => {
            if (!removed.length) return;
            remove.mutate(
                { positions: removed.map(item => item.position), revision: data?.revision },
                { onError: showError },
            );
            list.clearSelection();
        },
    };
    return <QueueModeContext value={value}>{children}</QueueModeContext>;
}

import type { ItemsSummary } from '@/app/_api/types';

export const noItems: ItemsSummary = { count: 0, duration: 0, size: 0 };

// `a` with `b` added, or taken away when `sign` is -1.
export function addSummary(a: ItemsSummary, b: ItemsSummary, sign: 1 | -1 = 1): ItemsSummary {
    return { count: a.count + sign * b.count, duration: a.duration + sign * b.duration, size: a.size + sign * b.size };
}

export function sumSummaries(summaries: Iterable<ItemsSummary>): ItemsSummary {
    let sum = noItems;
    for (const summary of summaries) sum = addSummary(sum, summary);
    return sum;
}

export function summaryOf({ duration, size }: { duration: number; size: number }): ItemsSummary {
    return { count: 1, duration, size };
}

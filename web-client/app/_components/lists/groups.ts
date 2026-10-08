import type { PlaylistGroup } from '@/app/_api/types';
import { useState } from 'react';

// The positions of a group's items.
export function groupPositions(group: PlaylistGroup): number[] {
    return Array.from({ length: group.count }, (_, i) => group.firstPosition + i);
}

// A group's checkbox from its rows one by one, for lists that hold every row.
export function positionsCheckState(group: PlaylistGroup, isSelected: (position: number) => boolean) {
    let selected = 0;
    for (let position = group.firstPosition; position < group.firstPosition + group.count; position++)
        if (isSelected(position)) selected++;
    const checked = group.count > 0 && selected === group.count;
    return { checked, indeterminate: !checked && selected > 0 };
}

// Groups folded on the client, named by keys that survive the list changing.
export function useCollapsedGroups() {
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
    return {
        collapsed,
        toggle(key: string) {
            setCollapsed(current => {
                const next = new Set(current);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
            });
        },
        setAll(expanded: boolean, keys: Iterable<string>) {
            setCollapsed(expanded ? new Set() : new Set(keys));
        },
    };
}

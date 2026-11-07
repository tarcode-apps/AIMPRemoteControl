import type { PlaylistGroup } from '@/app/_api/types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MenuItem } from '../menus';

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

type GroupFolding = {
    toggle(group: PlaylistGroup): void;
    setAll(expanded: boolean): void;
    // While the list cannot fold, as a playlist being searched or sorted.
    disabled?: boolean;
};

// The folding entries of a group's menu: the group itself, then all of them.
export function useFoldingItems() {
    const { t } = useTranslation();
    return (group: PlaylistGroup, { toggle, setAll, disabled = false }: GroupFolding): MenuItem[] => [
        {
            label: t(group.expanded ? 'playlist.collapseGroup' : 'playlist.expandGroup'),
            icon: group.expanded ? 'expand_less' : 'expand_more',
            disabled,
            onSelect: () => toggle(group),
        },
        { label: t('playlist.collapseAll'), icon: 'unfold_less', disabled, onSelect: () => setAll(false) },
        { label: t('playlist.expandAll'), icon: 'unfold_more', disabled, onSelect: () => setAll(true) },
    ];
}

'use client';

import { anchorName } from '@/app/_utils/anchorName';
import { useId, useState, type ReactNode } from 'react';
import { MenuPopover, type MenuItem } from './Menu';

// What a row's menu button needs: it is a real opener of the shared popover, so
// that the browser's light dismiss leaves it alone, and it tells the menu which
// row asked.
export type RowMenuButton = {
    popoverTarget: string;
    anchor: string;
    open: boolean;
    onOpen(): void;
};

// One menu for all rows of a list, opened at the button of the row it was asked
// from. `items` builds the menu for the row's target.
export function useRowMenu<T>(items: (target: T) => MenuItem[]) {
    const id = useId();
    const [current, setCurrent] = useState<{ row: number; target: T } | null>(null);
    const anchorOf = (row: number) => anchorName('row-menu', `${id}-${row}`);

    const button = (row: number, target: T): RowMenuButton => ({
        popoverTarget: id,
        anchor: anchorOf(row),
        open: current?.row === row,
        onOpen: () => setCurrent({ row, target }),
    });

    const popover: ReactNode = (
        <MenuPopover
            id={id}
            anchor={current ? anchorOf(current.row) : undefined}
            items={current ? items(current.target) : []}
            onClose={() => setCurrent(null)}
        />
    );

    return { button, popover };
}

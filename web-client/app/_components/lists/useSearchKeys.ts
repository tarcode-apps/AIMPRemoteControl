'use client';

import { useEffect, type RefObject } from 'react';
import type { ListModeValue } from './ListMode';
import type { PlaylistRow, PlaylistRows } from './playlistRows';
import type { useActiveRow } from './useActiveRow';

export type SearchKeysOptions = {
    mode: ListModeValue;
    rows: PlaylistRows;
    active: ReturnType<typeof useActiveRow>;
    // The listbox, which the arrows send the focus to.
    list: RefObject<HTMLElement | null>;
    // The list is not the one the field searches, or it sorts: the keys stay the field's.
    disabled?: boolean;
    // Enter, on the row under the cursor, else on the first item; without it the
    // key stays the field's.
    onEnter?: (row: PlaylistRow) => void;
};

// The keys of the list's search field that the list takes: the arrows walk into
// it, Enter acts on a row.
export function useSearchKeys({ mode, rows, active, list, disabled = false, onEnter }: SearchKeysOptions) {
    useEffect(() => {
        if (disabled) return;
        mode.setSearchKeys(event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                list.current?.focus();
                active.move(event.key, rows.count, 1);
                return true;
            }
            if (event.key !== 'Enter' || !onEnter) return false;
            const row = active.row ?? rows.firstItemRow;
            if (row === null) return false;
            onEnter(rows.at(row));
            return true;
        });
        return () => mode.setSearchKeys(null);
    });
}

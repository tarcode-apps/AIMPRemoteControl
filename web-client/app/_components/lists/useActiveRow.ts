import { useState } from 'react';
import type { PlaylistRowKey, PlaylistRows } from './playlistRows';

// The listbox keeps the focus itself and points at one active row, so no row has
// to be focusable or even mounted. The row is remembered by what it shows rather
// than by its number, which changes as groups fold. `byKeyboard` tells whether the
// row was reached with the keys: a group is highlighted only then, and a click on a
// group only folds it.
export function useActiveRow(rows: PlaylistRows, scrollTo: (row: number) => void) {
    const [key, setKey] = useState<PlaylistRowKey | null>(null);
    const [byKeyboard, setByKeyboard] = useState(false);
    const row = key === null ? null : rows.rowOf(key);

    const activate = (next: number) => {
        setKey(rows.keyAt(next));
        setByKeyboard(true);
        scrollTo(next);
    };

    // Null takes the cursor away.
    const select = (next: PlaylistRowKey | null) => {
        setKey(next);
        setByKeyboard(false);
    };

    // The row a moving key takes the cursor to; null for a key that is not one.
    const move = (eventKey: string, count: number, pageRows: number): number | null => {
        const current = row ?? -1;
        const clamp = (next: number) => Math.min(Math.max(next, 0), count - 1);
        let next: number;
        switch (eventKey) {
            case 'ArrowDown':
                next = clamp(current + 1);
                break;
            case 'ArrowUp':
                next = clamp(current < 0 ? 0 : current - 1);
                break;
            case 'PageDown':
                next = clamp(current + pageRows);
                break;
            case 'PageUp':
                next = clamp(current - pageRows);
                break;
            case 'Home':
                next = 0;
                break;
            case 'End':
                next = count - 1;
                break;
            default:
                return null;
        }
        activate(next);
        return next;
    };

    return { row, byKeyboard, select, move };
}

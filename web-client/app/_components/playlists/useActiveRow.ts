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

    const select = (next: PlaylistRowKey) => {
        setKey(next);
        setByKeyboard(false);
    };

    // False for keys that do not move the active row.
    const move = (eventKey: string, count: number, pageRows: number) => {
        const current = row ?? -1;
        const clamp = (next: number) => Math.min(Math.max(next, 0), count - 1);
        switch (eventKey) {
            case 'ArrowDown':
                activate(clamp(current + 1));
                break;
            case 'ArrowUp':
                activate(clamp(current < 0 ? 0 : current - 1));
                break;
            case 'PageDown':
                activate(clamp(current + pageRows));
                break;
            case 'PageUp':
                activate(clamp(current - pageRows));
                break;
            case 'Home':
                activate(0);
                break;
            case 'End':
                activate(count - 1);
                break;
            default:
                return false;
        }
        return true;
    };

    return { row, byKeyboard, select, move };
}

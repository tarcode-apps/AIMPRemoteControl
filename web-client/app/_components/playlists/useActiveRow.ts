import { useState } from 'react';

// The listbox keeps the focus itself and points at one active row, so no row has
// to be focusable or even mounted. `byKeyboard` tells whether the row was reached
// with the keys: a clicked group only collapses and is not highlighted.
export function useActiveRow(scrollTo: (row: number) => void) {
    const [row, setRow] = useState<number | null>(null);
    const [byKeyboard, setByKeyboard] = useState(false);

    const activate = (next: number) => {
        setRow(next);
        setByKeyboard(true);
        scrollTo(next);
    };

    const select = (next: number) => {
        setRow(next);
        setByKeyboard(false);
    };

    // False for keys that do not move the active row.
    const move = (key: string, count: number, pageRows: number) => {
        const current = row ?? -1;
        const clamp = (next: number) => Math.min(Math.max(next, 0), count - 1);
        switch (key) {
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

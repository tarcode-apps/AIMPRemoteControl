import { useState } from 'react';

export type FocusReturn = {
    // Called before a key sends the focus into a field.
    remember(): void;
    // Sends the focus back, as long as it is still in the field or has fallen to
    // the body with the field's going; a click elsewhere meanwhile keeps its place.
    back(): void;
};

// Where the focus was before a key sent it into a field, for Escape to send it
// back. One object for the component's life, so that it can be a dependency.
export function useFocusReturn(): FocusReturn {
    const [focus] = useState(() => {
        let from: HTMLElement | null = null;
        return {
            remember: () => {
                from = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            },
            back: () => {
                const active = document.activeElement;
                const inField = active instanceof HTMLInputElement && active.type === 'search';
                if (from && (inField || active === document.body)) from.focus();
                from = null;
            },
        };
    });
    return focus;
}

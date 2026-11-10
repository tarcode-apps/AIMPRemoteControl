import { useEffect, useEffectEvent } from 'react';

// Where the key edits or selects text of its own: a field, or a dialog, whose
// text is the user's to select.
function ownsText(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select, dialog[open]') !== null)
    );
}

// Ctrl+A, Cmd+A on a Mac.
export function isSelectAllKey(event: KeyboardEvent): boolean {
    return (event.ctrlKey || event.metaKey) && event.code === 'KeyA';
}

export type GlobalKeyOptions = {
    // The key means nothing to a text field, as Ctrl+K: taken in fields too.
    inFields?: boolean;
};

// A key the application takes from the browser wherever it is pressed: the page
// is an interface, not a document, so Ctrl+A never selects its every text and
// Escape reaches the list from the toolbar. A text field and an open dialog or
// popover keep the key for themselves, unless `inFields` says the key is no
// field's. `onKey` acts on it; without one it is only swallowed.
export function useGlobalKey(
    matches: (event: KeyboardEvent) => boolean,
    onKey?: (event: KeyboardEvent) => void,
    { inFields = false }: GlobalKeyOptions = {},
) {
    const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
        if (!matches(event) || document.querySelector(':popover-open')) return;
        if (ownsText(event.target) && !(inFields && event.target instanceof HTMLInputElement)) return;
        event.preventDefault();
        onKey?.(event);
    });
    useEffect(() => {
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, []);
}

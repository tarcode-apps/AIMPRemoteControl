import { useEffect, useId, useRef } from 'react';

// A layer that the back gesture should close before it leaves the page: a search,
// a selection, the drawer, the player sheet. While `active`, a history entry with
// the layer's mark sits on top, so that going back pops it and calls `onBack`
// instead of leaving the page. A layer closed in any other way pops its own entry.
// Layers stack, each mark being its own key in the history state.
//
// `dismiss` closes the layer and runs `after` once the entry is gone: what comes
// next, such as a navigation, must not land on top of the layer's entry.
export function useBackGesture(active: boolean, onBack: () => void) {
    const key = `back-${useId()}`;
    const callback = useRef(onBack);
    // Only an entry this page pushed is taken back; a mark left by an earlier page
    // load is cleared instead.
    const pushed = useRef(false);

    useEffect(() => {
        callback.current = onBack;
    });

    useEffect(() => {
        const marked = Boolean(window.history.state?.[key]);
        if (!active) {
            if (marked && pushed.current) window.history.back();
            else if (marked) window.history.replaceState({ ...window.history.state, [key]: undefined }, '');
            return;
        }
        if (!marked) {
            window.history.pushState({ ...window.history.state, [key]: true }, '');
            pushed.current = true;
        }
        const onPopState = (event: PopStateEvent) => {
            if (!event.state?.[key]) callback.current();
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [active, key]);

    return {
        dismiss(after?: () => void) {
            if (window.history.state?.[key] && pushed.current) {
                const once = () => {
                    window.removeEventListener('popstate', once);
                    after?.();
                };
                window.addEventListener('popstate', once);
                window.history.back();
            } else {
                callback.current();
                after?.();
            }
        },
    };
}

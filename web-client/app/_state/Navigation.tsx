'use client';

import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { media } from '@/app/_styles/media';
import { usePathname, useRouter, useSelectedLayoutSegment } from 'next/navigation';
import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    useSyncExternalStore,
    type ReactNode,
    type RefObject,
} from 'react';

// The route group of the screens that sit over a main one and show a back arrow.
export const secondScreenSegment = '(second-screen)';

const depthKey = 'screenDepth';
const playerDepth = 0;
const mainDepth = 1;
const secondDepth = 2;

type Router = ReturnType<typeof useRouter>;

function storedDepth(): number | undefined {
    const depth = window.history.state?.[depthKey];
    return typeof depth === 'number' ? depth : undefined;
}

// An entry's state without the marks of the layers open on it.
function withoutMarks(state: unknown): Record<string, unknown> {
    return Object.fromEntries(Object.entries(state ?? {}).filter(([key]) => !key.startsWith('back-')));
}

// The entry on screen, which the player's entry takes over when back reaches it.
let shown: { url: string; state: Record<string, unknown> } | null = null;
function remember() {
    shown = { url: window.location.href, state: withoutMarks(window.history.state) };
}

const depthListeners = new Set<() => void>();
function notifyDepth() {
    depthListeners.forEach(listener => listener());
}
function writeDepth(depth: number) {
    window.history.replaceState({ ...window.history.state, [depthKey]: depth }, '');
    notifyDepth();
}
// The main screen under the player, as an entry of its own.
function pushMain() {
    window.history.pushState(
        { ...withoutMarks(window.history.state), [depthKey]: mainDepth },
        '',
        window.location.href,
    );
    notifyDepth();
    remember();
}
function subscribeDepth(onChange: () => void) {
    depthListeners.add(onChange);
    window.addEventListener('popstate', onChange);
    return () => {
        depthListeners.delete(onChange);
        window.removeEventListener('popstate', onChange);
    };
}

// Only to another route: one that changes the query alone would not show in
// `pathname`, and the pending depth would land on a later entry.
function navigateTo(router: Router, pending: RefObject<number | null>, href: string, depth: number, replace: boolean) {
    if (new URL(href, window.location.href).pathname === window.location.pathname) return;
    pending.current = depth;
    if (replace) router.replace(href);
    else router.push(href);
}

export type NavigationContextValue = {
    // The depth of the current entry: the player, a main screen or a second one.
    depth: number;
    // On the way back to the player, which covers the screens it passes.
    returning: boolean;
    goToPlayer(): void;
    // Shows the main screen under the player, which back returns from.
    leavePlayer(): void;
    // A main screen, such as a playlist or the favorites, in place of the current one.
    openScreen(href: string): void;
    // A screen with a back arrow, over the main one, which back returns to.
    openSecondScreen(href: string): void;
    goBack(): void;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function useNavigation(): NavigationContextValue {
    const value = useContext(NavigationContext);
    if (!value) throw new Error('useNavigation must be used inside <NavigationProvider>');
    return value;
}

// As in the native player for Android: the app opens on the player, back goes down
// a second screen to its main one, from a main screen to the player, and from the
// player out of the app. The history holds no more than those three entries, and
// the marks the layers such as a search or the drawer add on top. The player's
// entry shows the main screen last left, under the sheet or beside a docked player.
export function NavigationProvider({ children }: { children: ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const docked = useMediaQuery(media.playerDocked);
    const secondScreen = useSelectedLayoutSegment() === secondScreenSegment;
    // The depth of the entry a navigation of the app is about to make: the router
    // writes the entry with a state of its own, which gets the depth only after the
    // render that shows it.
    const pending = useRef<number | null>(null);
    const depth = useSyncExternalStore(
        subscribeDepth,
        () => storedDepth() ?? pending.current ?? playerDepth,
        () => playerDepth,
    );
    const [returning, setReturning] = useState(false);
    // Going back entry by entry, layer marks included, down to `depth`.
    const walk = useRef<{ depth: number; then(): void } | null>(null);
    // A page opened on a second screen gets the player and a main screen put under it.
    const reopen = useRef<string | null>(null);
    const started = useRef(false);
    const sheet = useRef(!docked);
    useEffect(() => {
        sheet.current = !docked;
    }, [docked]);

    const navigate = (href: string, depth: number, replace: boolean) =>
        navigateTo(router, pending, href, depth, replace);
    // After the router has taken the entry gone back to, which it would otherwise
    // put over what `then` navigates to.
    const walkTo = (depth: number, then: () => void = () => {}) => {
        walk.current = { depth, then: () => window.setTimeout(then) };
        window.history.back();
    };

    useEffect(() => {
        if (!started.current) {
            started.current = true;
            if (storedDepth() === undefined && secondScreen) {
                reopen.current = window.location.pathname + window.location.search;
                navigateTo(router, pending, '/', playerDepth, true);
                return;
            }
        }
        if (pending.current !== null) {
            writeDepth(pending.current);
            pending.current = null;
        } else if (storedDepth() === undefined) writeDepth(playerDepth);
        remember();
        const target = reopen.current;
        if (target && !secondScreen) {
            reopen.current = null;
            if (!docked) pushMain();
            navigateTo(router, pending, target, secondDepth, false);
        }
    }, [pathname, router, secondScreen, docked]);

    useEffect(() => {
        // Before the router's own listener, which would show the entry's screen.
        const onPopState = (event: PopStateEvent) => {
            const depth = storedDepth() ?? playerDepth;
            const step = walk.current;
            if (step && depth > step.depth) {
                remember();
                window.history.back();
                return;
            }
            walk.current = null;
            if (!step) setReturning(false);
            const left = shown;
            // Under the sheet the player's entry becomes the main screen just left,
            // so the router has nothing to change while the sheet comes up.
            if (depth === playerDepth && sheet.current && left?.state[depthKey] === mainDepth) {
                event.stopImmediatePropagation();
                window.history.replaceState({ ...left.state, [depthKey]: playerDepth }, '', left.url);
                notifyDepth();
            }
            remember();
            step?.then();
        };
        window.addEventListener('popstate', onPopState, { capture: true });
        return () => window.removeEventListener('popstate', onPopState, { capture: true });
    }, []);

    const leavePlayer = () => {
        if (depth === playerDepth && !docked) pushMain();
    };
    const goToPlayer = () => {
        if (depth === playerDepth) return;
        setReturning(true);
        walkTo(playerDepth, () => setReturning(false));
    };

    const value: NavigationContextValue = {
        depth,
        returning,
        goToPlayer,
        leavePlayer,
        openScreen: href => {
            if (depth === playerDepth) {
                if (href === pathname) leavePlayer();
                else navigate(href, mainDepth, false);
            } else if (depth === mainDepth) navigate(href, mainDepth, true);
            else walkTo(mainDepth, () => navigate(href, mainDepth, true));
        },
        openSecondScreen: href => {
            if (depth === playerDepth) leavePlayer();
            if (depth < secondDepth) navigate(href, secondDepth, false);
            else if (depth === secondDepth) navigate(href, secondDepth, true);
            else walkTo(secondDepth, () => navigate(href, secondDepth, true));
        },
        // A screen down, past the marks of any layers open on this one.
        goBack: () => {
            if (depth === mainDepth) goToPlayer();
            else if (depth > mainDepth) walkTo(depth - 1);
            else navigate('/', playerDepth, true);
        },
    };

    return <NavigationContext value={value}>{children}</NavigationContext>;
}

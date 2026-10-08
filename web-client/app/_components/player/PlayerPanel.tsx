'use client';

import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { useNavigation } from '@/app/_state/Navigation';
import { media } from '@/app/_styles/media';
import clsx from 'clsx';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { MiniPlayer } from './MiniPlayer';
import { NowPlaying } from './NowPlaying';
import styles from './PlayerPanel.module.scss';
import { useSheetDrag } from './useSheetDrag';

const settleTimeout = 1000;

export type PlayerPanelContextValue = {
    expanded: boolean;
    docked: boolean;
    expand(): void;
    collapse(): void;
};

const PlayerPanelContext = createContext<PlayerPanelContextValue | null>(null);

export function usePlayerPanel(): PlayerPanelContextValue {
    const value = useContext(PlayerPanelContext);
    if (!value) throw new Error('usePlayerPanel must be used inside <PlayerPanelProvider>');
    return value;
}

// The sheet is up on the player's history entry, see useNavigation.
export function PlayerPanelProvider({ children }: { children: ReactNode }) {
    const docked = useMediaQuery(media.playerDocked);
    const { depth, returning, goToPlayer, leavePlayer } = useNavigation();
    const expanded = !docked && (depth === 0 || returning);

    useEffect(() => {
        if (!expanded) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') leavePlayer();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [expanded, leavePlayer]);

    const value: PlayerPanelContextValue = {
        expanded,
        docked,
        expand: () => {
            closeKeyboard();
            goToPlayer();
        },
        collapse: leavePlayer,
    };

    return <PlayerPanelContext value={value}>{children}</PlayerPanelContext>;
}

// The keyboard of a focused field would take the room the sheet opens into.
function closeKeyboard() {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) active.blur();
}

export function PlayerPanel() {
    const { expanded, docked, expand, collapse } = usePlayerPanel();
    const panelRef = useRef<HTMLElement>(null);
    const miniRef = useRef<HTMLDivElement>(null);
    // From a change of state, or a release of the drag, until the sheet settles.
    const [moving, setMoving] = useState(false);
    const [settledAs, setSettledAs] = useState(expanded);
    if (settledAs !== expanded) {
        setSettledAs(expanded);
        setMoving(true);
    }
    const drag = useSheetDrag({
        panelRef,
        handleRef: miniRef,
        expanded,
        enabled: !docked,
        onPull: closeKeyboard,
        onExpand: () => {
            setMoving(true);
            expand();
        },
        onCollapse: () => {
            setMoving(true);
            collapse();
        },
    });
    // A sheet that is hidden or already in place has no transition to end.
    useEffect(() => {
        if (!moving) return;
        const timer = window.setTimeout(() => setMoving(false), settleTimeout);
        return () => window.clearTimeout(timer);
    }, [moving]);

    return (
        <aside
            ref={panelRef}
            className={clsx(
                styles.panel,
                expanded && styles.expanded,
                drag.dragging && styles.dragging,
                moving && styles.moving,
            )}
            onTransitionEnd={event => {
                if (event.target === event.currentTarget && event.propertyName === 'transform') setMoving(false);
            }}
            {...drag.handlers}
        >
            <div ref={miniRef} className={styles.mini}>
                <MiniPlayer onExpand={expand} />
            </div>
            <div className={styles.full}>
                <NowPlaying />
            </div>
        </aside>
    );
}

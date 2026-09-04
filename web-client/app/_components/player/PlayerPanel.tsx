'use client';

import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { media } from '@/app/_styles/media';
import clsx from 'clsx';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useDrawer } from '../sidenav';
import { MiniPlayer } from './MiniPlayer';
import { NowPlaying } from './NowPlaying';
import styles from './PlayerPanel.module.scss';
import { useSheetDrag } from './useSheetDrag';

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

export function PlayerPanelProvider({ children }: { children: ReactNode }) {
    const docked = useMediaQuery(media.playerDocked);
    const pathname = usePathname();
    const [opened, setOpened] = useState(false);
    const [openedAt, setOpenedAt] = useState(pathname);
    if (openedAt !== pathname) {
        setOpenedAt(pathname);
        setOpened(false);
    }
    const expanded = opened && !docked;

    useEffect(() => {
        if (!expanded) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpened(false);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [expanded]);

    const value: PlayerPanelContextValue = {
        expanded,
        docked,
        expand: () => setOpened(true),
        collapse: () => setOpened(false),
    };

    return <PlayerPanelContext value={value}>{children}</PlayerPanelContext>;
}

export function PlayerPanel() {
    const { expanded, docked, expand, collapse } = usePlayerPanel();
    const { secondary } = useDrawer();
    const panelRef = useRef<HTMLElement>(null);
    const miniRef = useRef<HTMLDivElement>(null);
    const drag = useSheetDrag({
        panelRef,
        handleRef: miniRef,
        expanded,
        enabled: !docked,
        onExpand: expand,
        onCollapse: collapse,
    });

    return (
        <aside
            ref={panelRef}
            className={clsx(
                styles.panel,
                secondary && styles.hidden,
                expanded && styles.expanded,
                drag.dragging && styles.dragging,
            )}
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

'use client';

import { useBackGesture } from '@/app/_hooks/useBackGesture';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { secondScreenSegment } from '@/app/_state/Navigation';
import { media } from '@/app/_styles/media';
import clsx from 'clsx';
import { usePathname, useSelectedLayoutSegment } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import styles from './Drawer.module.scss';
import { useDrawerGestures } from './useDrawerGestures';

export type DrawerContextValue = {
    opened: boolean;
    secondary: boolean;
    open(): void;
    close(): void;
    // Closes the drawer, then does `after`: a navigation from the drawer must not
    // land on the drawer's own history entry.
    closeThen(after: () => void): void;
};

const DrawerContext = createContext<DrawerContextValue | null>(null);

type DrawerElementProps = {
    drawerRef: RefObject<HTMLElement | null>;
    dragging: boolean;
};

const DrawerElementContext = createContext<DrawerElementProps | null>(null);

export function useDrawer(): DrawerContextValue {
    const value = useContext(DrawerContext);
    if (!value) throw new Error('useDrawer must be used inside <DrawerContainer>');
    return value;
}

export function DrawerContainer({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const secondary = useSelectedLayoutSegment() === secondScreenSegment;
    const modal = useMediaQuery(media.drawerModal);
    const containerRef = useRef<HTMLDivElement>(null);
    const drawerRef = useRef<HTMLElement>(null);

    const [opened, setOpened] = useState(false);
    const back = useBackGesture(opened, () => setOpened(false));
    const [shownAt, setShownAt] = useState(pathname);
    if (shownAt !== pathname) {
        setShownAt(pathname);
        setOpened(false);
    }

    useEffect(() => {
        document.body.classList.toggle('drawer-open', opened);
        if (!opened) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpened(false);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.classList.remove('drawer-open');
        };
    }, [opened]);

    const gestures = useDrawerGestures({
        containerRef,
        drawerRef,
        enabled: modal && !secondary,
        opened,
        open: () => setOpened(true),
        close: () => setOpened(false),
    });

    const drawer: DrawerContextValue = {
        opened,
        secondary,
        open: () => {
            if (!secondary) setOpened(true);
        },
        close: () => setOpened(false),
        closeThen: after => back.dismiss(after),
    };

    const element: DrawerElementProps = { drawerRef, dragging: gestures.dragging };

    return (
        <DrawerContext value={drawer}>
            <DrawerElementContext value={element}>
                <div ref={containerRef} className={styles.container} {...gestures.containerHandlers}>
                    {children}
                    <div
                        className={clsx(styles.backdrop, opened && styles.open, gestures.dragging && styles.dragging)}
                        onClick={drawer.close}
                    />
                </div>
            </DrawerElementContext>
        </DrawerContext>
    );
}

export function Drawer({ children }: { children: ReactNode }) {
    const { opened } = useDrawer();
    const element = useContext(DrawerElementContext);
    if (!element) throw new Error('<Drawer> must be used inside <DrawerContainer>');
    const { drawerRef, dragging } = element;
    return (
        <aside ref={drawerRef} className={clsx(styles.drawer, opened && styles.open, dragging && styles.dragging)}>
            {children}
        </aside>
    );
}

export function DrawerContent({ children }: { children: ReactNode }) {
    return <main className={styles.content}>{children}</main>;
}

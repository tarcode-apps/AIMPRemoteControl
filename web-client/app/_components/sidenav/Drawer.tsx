'use client';

import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { media } from '@/app/_styles/media';
import clsx from 'clsx';
import { usePathname, useRouter, useSelectedLayoutSegment } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import styles from './Drawer.module.scss';
import { useDrawerGestures } from './useDrawerGestures';

const SECOND_SCREEN_SEGMENT = '(second-screen)';

export type DrawerContextValue = {
    opened: boolean;
    secondary: boolean;
    open(): void;
    close(): void;
    goBack(): void;
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
    const router = useRouter();
    const pathname = usePathname();
    const secondary = useSelectedLayoutSegment() === SECOND_SCREEN_SEGMENT;
    const modal = useMediaQuery(media.drawerModal);
    const containerRef = useRef<HTMLDivElement>(null);
    const drawerRef = useRef<HTMLElement>(null);

    const [opened, setOpened] = useState(false);
    // Number of in-app navigations since the page was loaded: tells whether
    // history.back() stays inside the app or would leave it.
    const [visited, setVisited] = useState({ pathname, depth: 0 });
    if (visited.pathname !== pathname) {
        setVisited({ pathname, depth: visited.depth + 1 });
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
        goBack: () => {
            if (visited.depth > 0) router.back();
            else router.replace('/');
        },
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

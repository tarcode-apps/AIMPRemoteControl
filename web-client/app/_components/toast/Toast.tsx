'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './Toast.module.scss';

const toastTime = 2500;

// A short message at the bottom of the screen, as Android shows one: over the
// toolbar, gone by itself a moment later.
function Toast({ message }: { message: string | null }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (message) ref.current?.showPopover();
        else ref.current?.hidePopover();
    }, [message]);
    return (
        <div ref={ref} popover="manual" role="status" data-testid="toast" className={styles.toast}>
            {message}
        </div>
    );
}

export function useToast(): { show(message: string): void; toast: ReactNode } {
    const [message, setMessage] = useState<string | null>(null);
    const timer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(timer.current), []);
    return {
        show(text) {
            setMessage(text);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setMessage(null), toastTime);
        },
        toast: <Toast message={message} />,
    };
}

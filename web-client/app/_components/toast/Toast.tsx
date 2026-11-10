'use client';

import { connectionState } from '@/app/_api/helpers/connection';
import { errorMessage, isConnectionError } from '@/app/_api/helpers/errors';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Toast.module.scss';

const toastTime = 2500;

type ToastValue = { show(message: string): void };

const ToastContext = createContext<ToastValue | null>(null);

// A short message at the bottom of the screen, as Android shows one: over the
// toolbar, gone by itself a moment later. One for the whole client; a new
// message takes the place of the one shown.
export function ToastProvider({ children }: { children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const [message, setMessage] = useState<string | null>(null);
    const timer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(timer.current), []);
    useEffect(() => {
        if (message) ref.current?.showPopover();
        else ref.current?.hidePopover();
    }, [message]);

    const value: ToastValue = {
        show(text) {
            setMessage(text);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setMessage(null), toastTime);
        },
    };
    return (
        <ToastContext.Provider value={value}>
            {children}
            <div ref={ref} popover="manual" role="status" data-testid="toast" className={styles.toast}>
                {message}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast(): ToastValue {
    const value = useContext(ToastContext);
    if (!value) throw new Error('useToast outside ToastProvider');
    return value;
}

// For an action whose failure has no place on screen of its own: the error goes
// to the toast. An action with a form shows its error there instead, and one
// that may fail unnoticed says why where it is called. A failure for want of
// the player is left to the connection banner, which says so already or will
// once the check under way fails.
export function useErrorToast(): (error: unknown) => void {
    const { t } = useTranslation();
    const toast = useToast();
    return error => {
        const { online, checking } = connectionState();
        if (isConnectionError(error) && (!online || checking)) return;
        toast.show(errorMessage(error, t));
    };
}

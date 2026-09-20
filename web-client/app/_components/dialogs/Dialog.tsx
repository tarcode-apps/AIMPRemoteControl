'use client';

import clsx from 'clsx';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './Dialog.module.scss';

export type DialogProps = {
    open: boolean;
    title: string;
    onClose(): void;
    // The content is a form: Enter and a submit button among `actions` submit it.
    onSubmit?(): void;
    // Below the scrolling content, always in view.
    footer?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
};

// A modal on the native dialog, which traps the focus and closes on Escape itself.
export function Dialog({ open, title, onClose, onSubmit, footer, actions, children, className }: DialogProps) {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        else if (!open && dialog.open) dialog.close();
    }, [open]);

    return (
        <dialog ref={ref} className={clsx(styles.dialog, className)} aria-labelledby={titleId} onClose={onClose}>
            <form
                className={styles.form}
                onSubmit={event => {
                    event.preventDefault();
                    onSubmit?.();
                }}
            >
                <h2 id={titleId} className={styles.title}>
                    {title}
                </h2>
                <div className={styles.body}>{children}</div>
                {footer && <div className={styles.footer}>{footer}</div>}
                {actions && <div className={styles.actions}>{actions}</div>}
            </form>
        </dialog>
    );
}

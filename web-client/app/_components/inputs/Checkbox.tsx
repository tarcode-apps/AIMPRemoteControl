'use client';

// The checkbox of forms and dialogs, styled like Radio, or the compact one of
// list rows.
import clsx from 'clsx';
import { useEffect, useRef, type InputHTMLAttributes } from 'react';
import styles from './Checkbox.module.scss';

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
    title: string;
    indeterminate?: boolean;
    variant?: 'form' | 'list';
};

export function Checkbox({ title, indeterminate = false, variant = 'form', className, ...rest }: CheckboxProps) {
    const ref = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (ref.current) ref.current.indeterminate = indeterminate;
    }, [indeterminate]);

    return (
        <input
            ref={ref}
            type="checkbox"
            aria-label={title}
            title={title}
            className={clsx(styles.checkbox, variant === 'list' && styles.list, className)}
            {...rest}
        />
    );
}

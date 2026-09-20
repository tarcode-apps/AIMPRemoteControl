'use client';

// The compact checkbox of list rows, drawn in the text colour.
import clsx from 'clsx';
import { useEffect, useRef, type InputHTMLAttributes } from 'react';
import styles from './ListCheckbox.module.scss';

export type ListCheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
    title: string;
    indeterminate?: boolean;
};

export function ListCheckbox({ title, indeterminate = false, className, ...rest }: ListCheckboxProps) {
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
            className={clsx(styles.checkbox, className)}
            {...rest}
        />
    );
}

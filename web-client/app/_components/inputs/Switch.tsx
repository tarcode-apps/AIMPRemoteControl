'use client';

import clsx from 'clsx';
import type { InputHTMLAttributes } from 'react';
import styles from './Switch.module.scss';

export type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
    title: string;
};

// An on/off toggle, as the player's Android app draws one.
export function Switch({ title, className, ...rest }: SwitchProps) {
    return (
        <input
            type="checkbox"
            role="switch"
            aria-label={title}
            title={title}
            className={clsx(styles.switch, className)}
            {...rest}
        />
    );
}

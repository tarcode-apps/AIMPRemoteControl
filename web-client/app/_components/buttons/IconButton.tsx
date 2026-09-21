'use client';

import clsx from 'clsx';
import styles from './IconButton.module.scss';
import { useHoldButton, type HoldButtonProps } from './useHoldButton';

export type IconButtonProps = HoldButtonProps;

export function IconButton(props: IconButtonProps) {
    const { pressed, tooltip, props: button } = useHoldButton(props);
    const { className, children, ...rest } = button;

    return (
        <button
            type="button"
            {...rest}
            className={clsx(styles.iconButton, className)}
            data-pressed={pressed || undefined}
        >
            {children}
            {tooltip}
        </button>
    );
}

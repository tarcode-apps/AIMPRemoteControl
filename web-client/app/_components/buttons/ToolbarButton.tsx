'use client';

import clsx from 'clsx';
import type { IconButtonProps } from './IconButton';
import styles from './ToolbarButton.module.scss';
import { useHoldButton } from './useHoldButton';

// Feedback is a ripple, for hovering and pressing alike.
export function ToolbarButton(props: IconButtonProps) {
    const { pressed, tooltip, props: button } = useHoldButton(props);
    const { className, children, ...rest } = button;

    return (
        <button type="button" {...rest} className={clsx(styles.button, className)} data-pressed={pressed || undefined}>
            <span className={styles.ripple} />
            {children}
            {tooltip}
        </button>
    );
}

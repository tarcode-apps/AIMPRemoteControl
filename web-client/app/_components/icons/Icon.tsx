import clsx from 'clsx';
import type { HTMLAttributes } from 'react';
import styles from './Icon.module.scss';

export type IconProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
    children: string;
};

export function Icon({ children, className, ...rest }: IconProps) {
    return (
        <span className={clsx(styles.icon, className)} aria-hidden="true" translate="no" {...rest}>
            {children}
        </span>
    );
}

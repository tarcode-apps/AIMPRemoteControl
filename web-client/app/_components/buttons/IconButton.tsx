import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';
import styles from './IconButton.module.scss';

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    title: string;
};

export function IconButton({ title, className, children, ...rest }: IconButtonProps) {
    return (
        <button type="button" aria-label={title} title={title} className={clsx(styles.iconButton, className)} {...rest}>
            {children}
        </button>
    );
}

import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';
import styles from './TextButton.module.scss';

export type TextButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function TextButton({ type = 'button', className, children, ...rest }: TextButtonProps) {
    return (
        <button type={type} className={clsx(styles.textButton, className)} {...rest}>
            {children}
        </button>
    );
}

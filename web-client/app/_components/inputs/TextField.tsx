import clsx from 'clsx';
import type { InputHTMLAttributes } from 'react';
import styles from './TextField.module.scss';

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
    type?: 'text' | 'time' | 'number';
};

export function TextField({ type = 'text', className, ...rest }: TextFieldProps) {
    return <input type={type} className={clsx(styles.textField, className)} {...rest} />;
}

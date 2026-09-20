import clsx from 'clsx';
import type { InputHTMLAttributes } from 'react';
import styles from './TextField.module.scss';

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function TextField({ className, ...rest }: TextFieldProps) {
    return <input type="text" className={clsx(styles.textField, className)} {...rest} />;
}

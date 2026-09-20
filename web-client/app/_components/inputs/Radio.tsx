import clsx from 'clsx';
import type { InputHTMLAttributes } from 'react';
import styles from './Radio.module.scss';

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function Radio({ className, ...rest }: RadioProps) {
    return <input type="radio" className={clsx(styles.radio, className)} {...rest} />;
}

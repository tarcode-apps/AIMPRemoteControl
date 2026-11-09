'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../buttons';
import { Icon } from '../icons';
import styles from './SearchField.module.scss';

export type SearchFieldProps = {
    value: string;
    onChange(value: string): void;
    onClose?(): void;
    autoFocus?: boolean;
    placeholder?: string;
    className?: string;
    // Buttons at the end of the field, after the one that clears it.
    actions?: ReactNode;
};

export function SearchField({
    value,
    onChange,
    onClose,
    autoFocus,
    placeholder,
    className,
    actions,
}: SearchFieldProps) {
    const { t } = useTranslation();
    const clear = () => {
        onChange('');
        onClose?.();
    };

    return (
        <label className={clsx(styles.field, className)}>
            <Icon className={styles.icon}>search</Icon>
            <input
                type="search"
                className={styles.input}
                value={value}
                placeholder={placeholder ?? t('playlist.searchPlaceholder')}
                autoFocus={autoFocus}
                enterKeyHint="search"
                onChange={event => onChange(event.target.value)}
                onKeyDown={event => {
                    if (event.key === 'Escape') clear();
                }}
            />
            {(value || onClose) && (
                <IconButton title={t('playlist.closeSearch')} className={styles.clear} onClick={clear}>
                    <Icon>close</Icon>
                </IconButton>
            )}
            {actions}
        </label>
    );
}

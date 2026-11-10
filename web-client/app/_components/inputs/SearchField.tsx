'use client';

import clsx from 'clsx';
import type { KeyboardEvent, ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../buttons';
import { Icon } from '../icons';
import styles from './SearchField.module.scss';

export type SearchFieldProps = {
    value: string;
    onChange(value: string): void;
    onClose?(): void;
    // After `onClose` on Escape, for the owner to take the focus back.
    onEscape?(): void;
    // Ahead of the field's own keys, which a key prevented does not reach.
    onKeyDown?(event: KeyboardEvent<HTMLInputElement>): void;
    autoFocus?: boolean;
    placeholder?: string;
    className?: string;
    // Buttons at the end of the field while it is empty; text puts the one that
    // clears it in their place.
    actions?: ReactNode;
    inputRef?: Ref<HTMLInputElement>;
};

export function SearchField({
    value,
    onChange,
    onClose,
    onEscape,
    onKeyDown,
    autoFocus,
    placeholder,
    className,
    actions,
    inputRef,
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
                ref={inputRef}
                type="search"
                className={styles.input}
                value={value}
                placeholder={placeholder ?? t('playlist.searchPlaceholder')}
                autoFocus={autoFocus}
                enterKeyHint="search"
                onChange={event => onChange(event.target.value)}
                // Escape undoes the last thing: the text, then the field.
                onKeyDown={event => {
                    onKeyDown?.(event);
                    if (event.defaultPrevented || event.key !== 'Escape') return;
                    if (value) onChange('');
                    else {
                        onClose?.();
                        onEscape?.();
                    }
                }}
            />
            {value || onClose ? (
                <IconButton title={t('playlist.closeSearch')} className={styles.clear} onClick={clear}>
                    <Icon>close</Icon>
                </IconButton>
            ) : (
                actions
            )}
        </label>
    );
}

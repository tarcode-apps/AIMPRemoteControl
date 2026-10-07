'use client';

import clsx from 'clsx';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../buttons';
import { Icon } from '../icons';
import { useDrawer } from '../sidenav';
import styles from './Screen.module.scss';

export type ScreenProps = {
    title?: string;
    subtitle?: string;
    tabs?: ReactNode;
    // Takes the heading's place at the same height, so the content does not move.
    search?: ReactNode;
    // Shows a back arrow that does this instead of the usual navigation.
    onBack?(): void;
    actions?: ReactNode;
    // A strip under the app bar for a state the whole list is in.
    notice?: ReactNode;
    toolbar?: ReactNode;
    children?: ReactNode;
};

export function Screen({ title, subtitle, tabs, search, onBack, actions, notice, toolbar, children }: ScreenProps) {
    const { secondary, open, goBack } = useDrawer();
    const { t } = useTranslation();
    const hasToolbar = toolbar != null;

    useEffect(() => {
        if (!hasToolbar) return;
        document.body.classList.add('has-toolbar');
        return () => document.body.classList.remove('has-toolbar');
    }, [hasToolbar]);

    return (
        <div className={clsx(styles.screen, secondary && styles.secondary)}>
            <header className={clsx(styles.appBar, tabs && styles.withTabs, search && styles.withSearch)}>
                {secondary || onBack ? (
                    <IconButton title={t('nav.back')} className={styles.nav} onClick={onBack ?? goBack}>
                        <Icon>arrow_back</Icon>
                    </IconButton>
                ) : (
                    <IconButton title={t('nav.menu')} className={styles.nav} onClick={open}>
                        <Icon>menu</Icon>
                    </IconButton>
                )}
                {tabs && <div className={styles.tabs}>{tabs}</div>}
                {search ? (
                    <div className={styles.search}>{search}</div>
                ) : (
                    <div className={styles.heading}>
                        <h1 className={styles.title}>{title}</h1>
                        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
                    </div>
                )}
                <div className={styles.actions}>{actions}</div>
            </header>
            {notice && (
                <div className={styles.notice} role="status">
                    {notice}
                </div>
            )}
            <div className={styles.body}>{children}</div>
            {hasToolbar && <footer className={styles.toolbar}>{toolbar}</footer>}
        </div>
    );
}

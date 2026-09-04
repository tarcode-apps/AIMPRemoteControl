'use client';

import { useEffect } from 'react';
import i18n from '.';

export function DetectLanguage() {
    useEffect(() => {
        const apply = (language: string) => {
            document.documentElement.lang = language;
            document.title = i18n.t('app.name');
        };
        i18n.changeLanguage().then(() => apply(i18n.resolvedLanguage ?? i18n.language));
        i18n.on('languageChanged', apply);
        return () => i18n.off('languageChanged', apply);
    }, []);
    return null;
}

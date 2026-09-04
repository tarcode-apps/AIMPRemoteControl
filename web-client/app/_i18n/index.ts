import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { fallbackLanguage, resources } from './resources';

// The language is pinned so that the static export and the first client render
// agree; <DetectLanguage> switches to the browser's language after hydration.
i18n.use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        lng: fallbackLanguage,
        fallbackLng: fallbackLanguage,
        supportedLngs: Object.keys(resources),
        nonExplicitSupportedLngs: true,
        initAsync: false,
        interpolation: { escapeValue: false },
        detection: {
            order: ['localStorage', 'navigator'],
            lookupLocalStorage: 'language',
            // Only an explicit choice belongs in localStorage; caching what was
            // detected would freeze the language when the browser's changes.
            caches: [],
        },
    });

export default i18n;

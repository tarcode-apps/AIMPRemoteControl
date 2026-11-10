import en from './en.json';
import ru from './ru.json';

export const fallbackLanguage = 'en';
export const resources = { en: { translation: en }, ru: { translation: ru } } as const;

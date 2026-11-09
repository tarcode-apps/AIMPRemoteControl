'use client';

import { useAbout } from '@/app/_api/about';
import { useTranslation } from 'react-i18next';

// The tab's title: the player's name, once the event stream has told it, before
// the app's own, in the language of the page. Rendered rather than written to
// the document, which the layout's metadata would write over.
export function DocumentTitle() {
    const { t } = useTranslation();
    const name = useAbout()?.name;
    return <title>{name ? `${name} – ${t('app.name')}` : t('app.name')}</title>;
}

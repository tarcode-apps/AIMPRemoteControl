'use client';

import { Screen } from '@/app/_components';
import { useTranslation } from 'react-i18next';

export default function Effects() {
    const { t } = useTranslation();
    return <Screen title={t('screens.effects')} />;
}

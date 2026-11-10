'use client';

import { errorMessage } from '@/app/_api/helpers/errors';
import { useSettings } from '@/app/_api/settings';
import { useTimer } from '@/app/_api/timer';
import { Screen } from '@/app/_components/pages';
import { useTranslation } from 'react-i18next';
import styles from './_components/Timer.module.scss';
import { TimerFormScreen } from './_components/TimerForm';
import { TimerStatusScreen } from './_components/TimerStatus';

export default function Timer() {
    const { t } = useTranslation();
    const { data: settings } = useSettings();
    const allowed = settings?.permissions.scheduler;
    const { data, error } = useTimer(allowed === true);

    if (data?.timer) return <TimerStatusScreen timer={data.timer} />;
    if (data) return <TimerFormScreen supportedActions={data.supportedActions} />;
    return (
        <Screen title={t('screens.timer')}>
            {allowed === false && <p className={styles.message}>{t('timer.disabled')}</p>}
            {error && <p className={styles.message}>{errorMessage(error, t)}</p>}
        </Screen>
    );
}

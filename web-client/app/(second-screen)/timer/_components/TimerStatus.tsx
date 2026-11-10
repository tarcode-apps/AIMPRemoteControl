'use client';

import { errorMessage } from '@/app/_api/helpers/errors';
import { useCancelTimer } from '@/app/_api/timer';
import type { ActiveTimer } from '@/app/_api/types';
import { TextButton } from '@/app/_components/buttons';
import { Icon } from '@/app/_components/icons';
import { Screen } from '@/app/_components/pages';
import { useRemaining } from '@/app/_hooks/useRemaining';
import { formatDuration } from '@/app/_utils/format';
import { useTranslation } from 'react-i18next';
import styles from './Timer.module.scss';

export type TimerStatusScreenProps = {
    timer: ActiveTimer;
};

// The running timer in the columns of the form: when it fires on the left, what
// it does on the right, the cancel button where the start button was.
export function TimerStatusScreen({ timer }: TimerStatusScreenProps) {
    const { t, i18n } = useTranslation();
    const cancel = useCancelTimer();
    const remaining = useRemaining(timer.expiresAt);
    const timed = timer.expiresAt !== undefined;

    const when =
        timer.trigger === 'at' && timer.expiresAt !== undefined
            ? t('timer.at', {
                  time: new Date(timer.expiresAt).toLocaleTimeString(i18n.language, {
                      hour: '2-digit',
                      minute: '2-digit',
                  }),
              })
            : t(`timer.triggers.${timer.trigger}`);

    return (
        <Screen
            title={t('screens.timer')}
            toolbar={
                <div className={styles.toolbar}>
                    <TextButton
                        className={styles.mainButton}
                        disabled={cancel.isPending}
                        onClick={() => cancel.mutate()}
                    >
                        {t('timer.cancel')}
                    </TextButton>
                </div>
            }
        >
            <div className={styles.columns}>
                <section>
                    <h2 className={styles.heading}>{t('timer.when')}</h2>
                    <p className={styles.detail}>{when}</p>
                    {timed && !timer.waitingTrackEnd && (
                        <p className={styles.countdown}>{formatDuration(Math.ceil(remaining / 1000))}</p>
                    )}
                    {timer.waitingTrackEnd && <p className={styles.detail}>{t('timer.waitingTrackEnd')}</p>}
                    {timer.waitTrackEnd && !timer.waitingTrackEnd && (
                        <p className={styles.detail}>{t('timer.waitTrackEnd')}</p>
                    )}
                    {timer.trigger === 'trackEnd' && (
                        <p className={styles.detail}>{t('timer.tracksLeft', { count: timer.tracksLeft })}</p>
                    )}
                </section>
                <section>
                    <h2 className={styles.heading}>{t('timer.then')}</h2>
                    <ul className={styles.actionList}>
                        {timer.actions.map(action => (
                            <li key={action} className={styles.action}>
                                <Icon className={styles.actionIcon}>select_check_box</Icon>
                                {t(`timer.actions.${action}`)}
                            </li>
                        ))}
                    </ul>
                </section>
                {cancel.error && (
                    <p className={styles.error} role="alert">
                        {errorMessage(cancel.error, t)}
                    </p>
                )}
            </div>
        </Screen>
    );
}

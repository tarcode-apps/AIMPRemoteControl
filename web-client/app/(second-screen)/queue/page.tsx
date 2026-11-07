'use client';

import { useQueue, useSetQueueSuspended } from '@/app/_api/queue';
import { TextButton } from '@/app/_components/buttons';
import { Icon } from '@/app/_components/icons';
import { useListHeading } from '@/app/_components/lists';
import { Screen } from '@/app/_components/pages';
import screenStyles from '@/app/_components/pages/Screen.module.scss';
import { useErrorToast } from '@/app/_components/toast';
import { sumSummaries, summaryOf } from '@/app/_utils/summary';
import { useTranslation } from 'react-i18next';
import { QueueModeProvider, useQueueMode } from './_components/QueueMode';
import { QueuePage } from './_components/QueuePage';
import { QueueToolbar } from './_components/QueueToolbar';

export default function Queue() {
    return (
        <QueueModeProvider>
            <QueueScreen />
        </QueueModeProvider>
    );
}

function QueueScreen() {
    const { t } = useTranslation();
    const showError = useErrorToast();
    const mode = useQueueMode();
    const { data: queue } = useQueue();
    const suspend = useSetQueueSuspended();
    const heading = useListHeading({
        mode,
        name: t('queue.title'),
        searchPlaceholder: t('queue.searchPlaceholder'),
        totals: queue && sumSummaries(queue.items.map(summaryOf)),
        selectedTotals: sumSummaries(mode.items.filter(item => mode.isSelected(item.position)).map(summaryOf)),
    });

    return (
        <Screen
            {...heading}
            notice={
                queue?.suspended && (
                    <>
                        <Icon className={screenStyles.noticeIcon}>pause_circle</Icon>
                        <span className={screenStyles.noticeText}>{t('queue.suspended')}</span>
                        <TextButton
                            className={screenStyles.noticeButton}
                            onClick={() => suspend.mutate(false, { onError: showError })}
                        >
                            {t('queue.resumeShort')}
                        </TextButton>
                    </>
                )
            }
            toolbar={<QueueToolbar />}
        >
            <QueuePage />
        </Screen>
    );
}

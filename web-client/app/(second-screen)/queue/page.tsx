'use client';

import { useQueue, useSetQueueSuspended } from '@/app/_api/queue';
import type { ItemsSummary, QueueItem } from '@/app/_api/types';
import { TextButton } from '@/app/_components/buttons';
import { Icon } from '@/app/_components/icons';
import { useListHeading } from '@/app/_components/lists';
import { Screen } from '@/app/_components/pages';
import screenStyles from '@/app/_components/pages/Screen.module.scss';
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

function totalsOf(items: QueueItem[]): ItemsSummary {
    return {
        count: items.length,
        duration: items.reduce((sum, item) => sum + item.duration, 0),
        size: items.reduce((sum, item) => sum + item.size, 0),
    };
}

function QueueScreen() {
    const { t } = useTranslation();
    const mode = useQueueMode();
    const { data: queue } = useQueue();
    const suspend = useSetQueueSuspended();
    const heading = useListHeading({
        mode,
        name: t('queue.title'),
        searchPlaceholder: t('queue.searchPlaceholder'),
        totals: queue && totalsOf(queue.items),
        selectedTotals: totalsOf(mode.items.filter(item => mode.isSelected(item.position))),
    });

    return (
        <Screen
            {...heading}
            notice={
                queue?.suspended && (
                    <>
                        <Icon className={screenStyles.noticeIcon}>pause_circle</Icon>
                        <span className={screenStyles.noticeText}>{t('queue.suspended')}</span>
                        <TextButton className={screenStyles.noticeButton} onClick={() => suspend.mutate(false)}>
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

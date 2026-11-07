'use client';

import { errorMessage } from '@/app/_api/helpers/errors';
import { TextButton } from '@/app/_components/buttons';
import { Icon } from '@/app/_components/icons';
import { useListHeading } from '@/app/_components/lists';
import { Screen } from '@/app/_components/pages';
import screenStyles from '@/app/_components/pages/Screen.module.scss';
import { usePlaylistSelection } from '@/app/_state/PlaylistSelection';
import { useUploads, type UploadJob } from '@/app/_state/Uploads';
import { summaryOf } from '@/app/_utils/summary';
import clsx from 'clsx';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PlaylistModeProvider, usePlaylistMode } from './_components/PlaylistMode';
import { PlaylistPager } from './_components/PlaylistPager';
import { PlaylistTabs } from './_components/PlaylistTabs';
import { PlaylistToolbar } from './_components/PlaylistToolbar';
import { usePlaylistView } from './_components/usePlaylistLayout';

export default function Playlists() {
    return (
        <PlaylistModeProvider>
            <PlaylistsScreen />
        </PlaylistModeProvider>
    );
}

function PlaylistsScreen() {
    const { t } = useTranslation();
    const { selected } = usePlaylistSelection();
    const mode = usePlaylistMode();
    const view = usePlaylistView(selected, mode.text);
    const groupTotals = useMemo(() => new Map(view.groups?.map(group => [group.index, group])), [view.groups]);
    const heading = useListHeading({
        mode,
        name: selected?.name,
        searchPlaceholder: t('playlist.searchPlaceholder'),
        totals: selected && { count: selected.itemCount, duration: selected.duration, size: selected.size },
        selectedTotals: mode.selectedTotals({
            all: view.totals,
            group: group => groupTotals.get(group),
            row: summaryOf,
        }),
    });

    const uploads = useUploads();

    // Only the playlist the files go to tells of them, a line for each job; a
    // failure wraps so that its reason is read whole, and a progress line keeps
    // its figure in view.
    const jobs = uploads.jobs.filter(job => selected !== undefined && job.playlistId === selected.id);
    const jobLine = (job: UploadJob) => {
        if (job.state === 'failed')
            return (
                <>
                    <Icon className={screenStyles.noticeIcon}>error</Icon>
                    <span className={clsx(screenStyles.noticeText, screenStyles.noticeWrap)}>
                        {t('upload.failed', { name: job.name, message: errorMessage(job.error, t) })}
                    </span>
                    <TextButton className={screenStyles.noticeButton} onClick={() => uploads.cancel(job.id)}>
                        {t('actions.ok')}
                    </TextButton>
                </>
            );
        return (
            <>
                <Icon className={screenStyles.noticeIcon}>{job.state === 'waiting' ? 'schedule' : 'upload'}</Icon>
                <span className={clsx(screenStyles.noticeText, screenStyles.noticeParts)}>
                    {job.state === 'waiting' ? (
                        <>
                            <span className={screenStyles.noticeDetail}>{t('upload.waiting')}</span>
                            <span className={screenStyles.noticeName}>{job.name}</span>
                        </>
                    ) : (
                        <>
                            <span className={screenStyles.noticeDetail}>
                                {t('upload.progress', { current: job.current, total: job.total })}
                            </span>
                            <span className={screenStyles.noticeName}>{job.fileName}</span>
                            <span className={screenStyles.noticeDetail}>{Math.round(job.fraction * 100)}%</span>
                        </>
                    )}
                </span>
                <TextButton className={screenStyles.noticeButton} onClick={() => uploads.cancel(job.id)}>
                    {t('actions.cancel')}
                </TextButton>
            </>
        );
    };
    const notice = jobs.length > 0 && (
        <div className={screenStyles.noticeLines}>
            {jobs.map(job => (
                <div key={job.id} className={screenStyles.noticeLine} data-testid="upload-job">
                    {jobLine(job)}
                </div>
            ))}
        </div>
    );

    // The tabs and the search field share the lower bar of a phone.
    return (
        <Screen
            title={heading.title}
            subtitle={heading.subtitle}
            onBack={heading.onBack}
            tabs={heading.search || <PlaylistTabs />}
            notice={notice}
            toolbar={<PlaylistToolbar />}
        >
            <PlaylistPager />
        </Screen>
    );
}

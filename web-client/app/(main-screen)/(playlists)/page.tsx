'use client';

import { errorMessage } from '@/app/_api/helpers/errors';
import { useSettings } from '@/app/_api/settings';
import { TextButton } from '@/app/_components/buttons';
import { Icon } from '@/app/_components/icons';
import { useListHeading } from '@/app/_components/lists';
import { Screen } from '@/app/_components/pages';
import screenStyles from '@/app/_components/pages/Screen.module.scss';
import { usePlaylistSelection } from '@/app/_state/PlaylistSelection';
import { useUploads } from '@/app/_state/Uploads';
import { summaryOf } from '@/app/_utils/summary';
import clsx from 'clsx';
import { useMemo, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PlaylistModeProvider, usePlaylistMode } from './_components/PlaylistMode';
import { PlaylistPager } from './_components/PlaylistPager';
import pagerStyles from './_components/PlaylistPager.module.scss';
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

    // Files dropped on the list are uploaded to the playlist shown, where allowed.
    const uploads = useUploads();
    const permissions = useSettings().data?.permissions;
    const canUpload = permissions?.uploadTracks === true && selected !== undefined && !selected.readOnly;
    const acceptsDrop = (event: DragEvent) => canUpload && event.dataTransfer.types.includes('Files');
    const onDragOver = (event: DragEvent) => {
        if (acceptsDrop(event)) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
        if (!acceptsDrop(event) || !selected) return;
        event.preventDefault();
        uploads.start(selected.id, [...event.dataTransfer.files]);
    };

    // Only the playlist the files go to tells of them; a failure wraps so that
    // its reason is read whole, and a progress line keeps its figure in view.
    let notice;
    const failure = uploads.failure?.playlistId === selected?.id ? uploads.failure : null;
    const progress = uploads.progress?.playlistId === selected?.id ? uploads.progress : null;
    if (failure)
        notice = (
            <>
                <Icon className={screenStyles.noticeIcon}>error</Icon>
                <span className={clsx(screenStyles.noticeText, screenStyles.noticeWrap)}>
                    {t('upload.failed', { name: failure.name, message: errorMessage(failure.error, t) })}
                </span>
                <TextButton className={screenStyles.noticeButton} onClick={uploads.dismissFailure}>
                    {t('actions.ok')}
                </TextButton>
            </>
        );
    else if (progress)
        notice = (
            <>
                <Icon className={screenStyles.noticeIcon}>upload</Icon>
                <span className={clsx(screenStyles.noticeText, screenStyles.noticeParts)}>
                    <span className={screenStyles.noticeDetail}>
                        {t('upload.progress', { current: progress.current, total: progress.total })}
                    </span>
                    <span className={screenStyles.noticeName}>{progress.name}</span>
                    <span className={screenStyles.noticeDetail}>{Math.round(progress.fraction * 100)}%</span>
                </span>
                <TextButton className={screenStyles.noticeButton} onClick={uploads.cancel}>
                    {t('actions.cancel')}
                </TextButton>
            </>
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
            <div className={pagerStyles.uploadTarget} onDragOver={onDragOver} onDrop={onDrop}>
                <PlaylistPager />
            </div>
        </Screen>
    );
}

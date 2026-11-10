'use client';

import { errorMessage, NetworkError } from '@/app/_api/helpers/errors';
import { responseError } from '@/app/_api/helpers/request';
import { itemFileUrl } from '@/app/_api/playlists';
import { useSettings } from '@/app/_api/settings';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TextButton } from '../buttons';
import { Dialog } from '../dialogs';
import type { MenuItem } from '../menus';
import styles from './PlaylistDialogs.module.scss';

// A track by its file, as the lists and the player name it. A stream has no file
// to download; a part of a container file downloads as the whole album's file.
export type DownloadableTrack = {
    playlistId: string;
    fileUri: string;
    isUrl: boolean;
    inContainer: boolean;
};

// The browser's download manager does not tell why a download failed, so the
// response is looked at first and dropped once it starts well.
async function checkDownload(url: string) {
    const controller = new AbortController();
    let response: Response;
    try {
        response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    } catch (cause) {
        throw new NetworkError(cause);
    }
    if (response.ok) {
        controller.abort();
        return;
    }
    throw responseError(response.status, response.headers.get('Content-Type'), await response.text());
}

// Saved by the browser itself, which shows the progress and keeps nothing in memory.
function save(url: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    document.body.append(link);
    link.click();
    link.remove();
}

export type TrackDownload = {
    // "Download" where the settings allow it, nothing otherwise.
    trackItems(track: DownloadableTrack): MenuItem[];
    // The failure, for the caller to render.
    dialogs: ReactNode;
};

export function useTrackDownload(): TrackDownload {
    const { t } = useTranslation();
    const allowed = useSettings().data?.permissions.downloadTracks === true;
    const [error, setError] = useState<unknown>(null);
    const close = () => setError(null);

    const download = async (track: DownloadableTrack) => {
        const url = itemFileUrl(track.playlistId, track.fileUri);
        try {
            await checkDownload(url);
        } catch (failure) {
            setError(failure);
            return;
        }
        save(url);
    };

    return {
        trackItems: track =>
            allowed
                ? [
                      {
                          label: t(track.inContainer ? 'playlist.downloadAlbum' : 'playlist.download'),
                          icon: 'download',
                          disabled: track.isUrl,
                          onSelect: () => void download(track),
                      },
                  ]
                : [],
        dialogs: error !== null && (
            <Dialog
                open
                compact
                title={t('playlist.download')}
                onClose={close}
                onSubmit={close}
                actions={<TextButton type="submit">{t('actions.ok')}</TextButton>}
            >
                <p className={styles.error}>{errorMessage(error, t)}</p>
            </Dialog>
        ),
    };
}

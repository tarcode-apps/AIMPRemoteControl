'use client';

import { useSettings } from '@/app/_api/settings';
import type { Playlist, UploadFile, UploadTarget } from '@/app/_api/types';
import { useUploads } from '@/app/_state/Uploads';
import { readDroppedFiles, totalSize } from '@/app/_utils/droppedFiles';
import { formatSize } from '@/app/_utils/format';
import { useTranslation } from 'react-i18next';
import { useErrorToast, useToast } from '../toast';

export type FileUpload = ReturnType<typeof useFileUpload>;

// What decides whether files may go up, and where they go.
export function useFileUpload() {
    const { t, i18n } = useTranslation();
    const settings = useSettings().data;
    const uploads = useUploads();
    const toast = useToast();
    const showError = useErrorToast();

    // Why no files may go into the playlist, or into a new one; null when they may.
    const refusal = (playlist: Playlist | null) => {
        if (!settings?.permissions.uploadTracks) return t('upload.disabled');
        return playlist?.readOnly ? t('upload.readOnly') : null;
    };

    // Why these files cannot go up in one request; null when they can.
    const filesRefusal = (files: UploadFile[]) => {
        if (files.length === 0) return t('upload.nothing');
        if (settings && files.length > settings.uploadFileLimit) {
            const number = new Intl.NumberFormat(i18n.language);
            return t('upload.tooMany', {
                files: number.format(files.length),
                limit: number.format(settings.uploadFileLimit),
            });
        }
        const size = totalSize(files);
        if (settings && size > settings.uploadLimit)
            return t('upload.tooLarge', {
                size: formatSize(size, i18n.language),
                limit: formatSize(settings.uploadLimit, i18n.language),
            });
        return null;
    };

    // Sends the files of a drop without asking where they go.
    const drop = (dataTransfer: DataTransfer, target: UploadTarget, onUploaded?: (playlistId: string) => void) =>
        readDroppedFiles(dataTransfer).then(files => {
            const refused = filesRefusal(files);
            if (refused) toast.show(refused);
            else uploads.start(target, files, onUploaded);
        }, showError);

    return { refusal, filesRefusal, drop, start: uploads.start };
}

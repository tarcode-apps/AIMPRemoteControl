import { useMutation, useQuery } from '@tanstack/react-query';
import { NetworkError } from './helpers/errors';
import { basePath, request, responseError } from './helpers/request';
import type {
    AddItemsRequest,
    FileFormats,
    FilesSort,
    FileType,
    FolderListing,
    UploadFile,
    UploadTarget,
} from './types';

export const fileKeys = {
    all: ['files'] as const,
    folder: (path: string, types: readonly FileType[], sort: FilesSort) =>
        ['files', path, types.join(','), sort.by, sort.descending] as const,
    formats: ['formats'] as const,
};

// The roots with an empty `path`.
export function useFolder(path: string, types: readonly FileType[], sort: FilesSort) {
    const query = new URLSearchParams({
        path,
        types: types.map(type => (type === 'playlist' ? 'playlists' : type)).join(','),
        sort: sort.by,
        descending: String(sort.descending),
    });
    return useQuery({
        queryKey: fileKeys.folder(path, types, sort),
        queryFn: ({ signal }) => request<FolderListing>('GET', `/files?${query}`, { signal }),
        // A folder changes behind the client's back; it is read again when shown.
        staleTime: 0,
    });
}

export function useFormats() {
    return useQuery({
        queryKey: fileKeys.formats,
        queryFn: ({ signal }) => request<FileFormats>('GET', '/formats', { signal }),
    });
}

// Adds files, folders, playlist files and URLs to a playlist; the player reports
// the new content through its events.
export function useAddItems() {
    return useMutation({
        mutationFn: ({ playlistId, ...body }: AddItemsRequest) =>
            request<unknown>('POST', `/playlists/${encodeURIComponent(playlistId)}/items`, { body }),
    });
}

function uploadUrl(target: UploadTarget) {
    if (target.playlistId === null) return `${basePath}/playlists/upload`;
    const { placement } = target;
    const query = new URLSearchParams({ placement: placement.kind });
    if (placement.kind === 'at') query.set('index', String(placement.index));
    return `${basePath}/playlists/${encodeURIComponent(target.playlistId)}/upload?${query}`;
}

// Sends the files in one request, which the player takes whole or not at all;
// `onProgress` gets the bytes sent so far. Resolves to the playlist they went to.
export function uploadFiles(
    target: UploadTarget,
    files: UploadFile[],
    onProgress: (sent: number) => void,
    signal: AbortSignal,
): Promise<string> {
    const cancelled = () => new DOMException('The upload was cancelled', 'AbortError');
    if (signal.aborted) return Promise.reject(cancelled());
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const abort = () => xhr.abort();
        const settle = (outcome: () => void) => {
            signal.removeEventListener('abort', abort);
            outcome();
        };
        xhr.open('POST', uploadUrl(target));
        xhr.upload.onprogress = event => onProgress(event.loaded);
        xhr.onload = () =>
            settle(() => {
                if (xhr.status < 200 || xhr.status >= 300)
                    reject(responseError(xhr.status, xhr.getResponseHeader('Content-Type'), xhr.responseText));
                else if (target.playlistId === null) resolve((JSON.parse(xhr.responseText) as { id: string }).id);
                else resolve(target.playlistId);
            });
        xhr.onerror = () => settle(() => reject(new NetworkError(undefined)));
        xhr.onabort = () => settle(() => reject(cancelled()));
        signal.addEventListener('abort', abort);
        const form = new FormData();
        for (const { file, path } of files) form.append('file', file, path);
        xhr.send(form);
    });
}

import { useMutation, useQuery } from '@tanstack/react-query';
import { NetworkError } from './helpers/errors';
import { basePath, request, responseError } from './helpers/request';
import type { AddItemsRequest, FileFormats, FilesSort, FileType, FolderListing } from './types';

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

// Sends one file; `onProgress` gets the bytes sent so far and the total.
export function uploadFile(
    playlistId: string,
    file: File,
    onProgress: (sent: number, total: number) => void,
    signal: AbortSignal,
): Promise<void> {
    const cancelled = () => new DOMException('The upload was cancelled', 'AbortError');
    if (signal.aborted) return Promise.reject(cancelled());
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const abort = () => xhr.abort();
        const settle = (outcome: () => void) => {
            signal.removeEventListener('abort', abort);
            outcome();
        };
        xhr.open('POST', `${basePath}/playlists/${encodeURIComponent(playlistId)}/upload`);
        xhr.upload.onprogress = event => {
            if (event.lengthComputable) onProgress(event.loaded, event.total);
        };
        xhr.onload = () =>
            settle(() => {
                if (xhr.status >= 200 && xhr.status < 300) resolve();
                else reject(responseError(xhr.status, xhr.getResponseHeader('Content-Type'), xhr.responseText));
            });
        xhr.onerror = () => settle(() => reject(new NetworkError(undefined)));
        xhr.onabort = () => settle(() => reject(cancelled()));
        signal.addEventListener('abort', abort);
        const form = new FormData();
        form.append('file', file, file.name);
        xhr.send(form);
    });
}

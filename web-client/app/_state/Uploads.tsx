'use client';

import { uploadFile } from '@/app/_api/files';
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

// The file on its way, of the batch it belongs to.
export type UploadProgress = {
    playlistId: string;
    current: number; // 1-based
    total: number;
    name: string;
    fraction: number; // 0..1 of the file
};

export type UploadFailure = {
    playlistId: string;
    name: string;
    error: unknown;
};

export type UploadsContextValue = {
    progress: UploadProgress | null;
    // The failure that stopped the last batch, until dismissed.
    failure: UploadFailure | null;
    // Sends the files one after the other; the player adds each to the playlist as
    // it arrives.
    start(playlistId: string, files: File[]): void;
    cancel(): void;
    dismissFailure(): void;
};

const UploadsContext = createContext<UploadsContextValue | null>(null);

export function useUploads(): UploadsContextValue {
    const value = useContext(UploadsContext);
    if (!value) throw new Error('useUploads must be used inside <UploadsProvider>');
    return value;
}

// Outlives the screens: a batch started from a playlist keeps going while the
// user looks elsewhere.
export function UploadsProvider({ children }: { children: ReactNode }) {
    const [progress, setProgress] = useState<UploadProgress | null>(null);
    const [failure, setFailure] = useState<UploadFailure | null>(null);
    const controller = useRef<AbortController | null>(null);

    const start = (playlistId: string, files: File[]) => {
        if (controller.current || files.length === 0) return;
        const aborter = new AbortController();
        controller.current = aborter;
        setFailure(null);
        void (async () => {
            let current = files[0];
            try {
                for (const [index, file] of files.entries()) {
                    current = file;
                    const report = (fraction: number) =>
                        setProgress({ playlistId, current: index + 1, total: files.length, name: file.name, fraction });
                    report(0);
                    await uploadFile(
                        playlistId,
                        file,
                        (sent, total) => report(total ? sent / total : 0),
                        aborter.signal,
                    );
                }
            } catch (error) {
                if (!(error instanceof DOMException && error.name === 'AbortError'))
                    setFailure({ playlistId, name: current.name, error });
            } finally {
                controller.current = null;
                setProgress(null);
            }
        })();
    };

    const value: UploadsContextValue = {
        progress,
        failure,
        start,
        cancel: () => controller.current?.abort(),
        dismissFailure: () => setFailure(null),
    };
    return <UploadsContext value={value}>{children}</UploadsContext>;
}

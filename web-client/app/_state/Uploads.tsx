'use client';

import { uploadFiles } from '@/app/_api/files';
import type { UploadFile, UploadTarget } from '@/app/_api/types';
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// Chrome opens six connections to a host: one carries the event stream and one is
// left for everything else.
const maxSending = 4;

// The files of one pick or drop, sent in one request.
export type UploadJob = {
    id: number;
    playlistId: string | null; // null: a new playlist
    // What the user picked: a folder or file, or the first of them and how many more.
    name: string;
    state: 'waiting' | 'sending' | 'failed';
    // Of the file being sent, 1-based.
    current: number;
    total: number;
    fileName: string;
    fraction: number; // 0..1 of the job
    error?: unknown;
};

type Job = UploadJob & {
    target: UploadTarget;
    files: UploadFile[];
    onUploaded?(playlistId: string): void;
    aborter?: AbortController;
};

export type UploadsContextValue = {
    jobs: UploadJob[];
    // Each playlist sends its jobs one after the other, in the order they came; a
    // new playlist is a playlist of its own.
    start(target: UploadTarget, files: UploadFile[], onUploaded?: (playlistId: string) => void): void;
    // Stops a job or takes it out of its queue; a failed one is dismissed.
    cancel(id: number): void;
};

const UploadsContext = createContext<UploadsContextValue | null>(null);

export function useUploads(): UploadsContextValue {
    const value = useContext(UploadsContext);
    if (!value) throw new Error('useUploads must be used inside <UploadsProvider>');
    return value;
}

// Outlives the screens: a job started from a playlist keeps going while the user
// looks elsewhere.
export function UploadsProvider({ children }: { children: ReactNode }) {
    const { t } = useTranslation();
    const jobs = useRef<Job[]>([]);
    const nextId = useRef(1);
    const [shown, setShown] = useState<UploadJob[]>([]);

    const publish = () =>
        setShown(
            jobs.current.map(({ id, playlistId, name, state, current, total, fileName, fraction, error }) => ({
                id,
                playlistId,
                name,
                state,
                current,
                total,
                fileName,
                fraction,
                error,
            })),
        );
    const queueOf = (job: Job) => job.playlistId ?? `new ${job.id}`;

    const remove = (job: Job) => {
        jobs.current = jobs.current.filter(other => other !== job);
        publish();
        pump();
    };

    const send = (job: Job) => {
        const aborter = new AbortController();
        job.state = 'sending';
        job.aborter = aborter;
        // The parts' headers add a little to the body; the file at a byte is close enough.
        let size = 0;
        const ends = job.files.map(({ file }) => (size += file.size));
        const report = (sent: number) => {
            const sending = ends.findIndex(fileEnd => sent < fileEnd);
            const index = sending < 0 ? job.files.length - 1 : sending;
            job.current = index + 1;
            job.fileName = job.files[index].path;
            job.fraction = size ? Math.min(sent / size, 1) : 0;
            publish();
        };
        report(0);
        uploadFiles(job.target, job.files, report, aborter.signal).then(
            playlistId => {
                remove(job);
                job.onUploaded?.(playlistId);
            },
            error => {
                if (aborter.signal.aborted) return remove(job);
                job.state = 'failed';
                job.error = error;
                publish();
                pump();
            },
        );
    };

    // Starts what may start: the first waiting job of every queue that sends
    // nothing, as long as there is a connection for it.
    const pump = () => {
        const busy = new Set(jobs.current.filter(job => job.state === 'sending').map(queueOf));
        for (const job of jobs.current) {
            if (busy.size >= maxSending) return;
            if (job.state !== 'waiting' || busy.has(queueOf(job))) continue;
            busy.add(queueOf(job));
            send(job);
        }
    };

    // What the user picked: its folders and loose files.
    const nameOf = (files: UploadFile[]) => {
        const picked = [...new Set(files.map(({ path }) => path.split('/')[0]))];
        return picked.length === 1 ? picked[0] : t('upload.more', { name: picked[0], count: picked.length - 1 });
    };

    const value: UploadsContextValue = {
        jobs: shown,
        start: (target, files, onUploaded) => {
            if (files.length === 0) return;
            jobs.current = [
                ...jobs.current,
                {
                    id: nextId.current++,
                    playlistId: target.playlistId,
                    name: nameOf(files),
                    state: 'waiting',
                    current: 1,
                    total: files.length,
                    fileName: files[0].path,
                    fraction: 0,
                    target,
                    files,
                    onUploaded,
                },
            ];
            publish();
            pump();
        },
        cancel: id => {
            const job = jobs.current.find(job => job.id === id);
            if (!job) return;
            if (job.state === 'sending') job.aborter!.abort();
            else remove(job);
        },
    };
    return <UploadsContext value={value}>{children}</UploadsContext>;
}

'use client';

import { coverUrl } from '@/app/_api/covers';
import { Cover } from './Cover';

export type TrackCoverProps = {
    // The playing track's cover hash; empty or absent for the placeholder.
    hash?: string;
    size?: number;
    className?: string;
};

export function TrackCover({ hash, size, className }: TrackCoverProps) {
    return (
        <Cover id={hash || undefined} urlFor={step => coverUrl(hash ?? '', step)} size={size} className={className} />
    );
}

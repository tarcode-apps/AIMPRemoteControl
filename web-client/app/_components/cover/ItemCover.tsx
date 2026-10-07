'use client';

import { itemCoverUrl } from '@/app/_api/covers';
import type { CSSProperties } from 'react';
import { Cover } from './Cover';

export type ItemCoverProps = {
    playlistId: string;
    index: number;
    coverKey: string;
    // The playlist revision the key was read at: tags written since may have
    // changed the cover behind the same key.
    revision: number;
    // The box's CSS size, square.
    size: number;
    className?: string;
};

export function ItemCover({ playlistId, index, coverKey, revision, size, className }: ItemCoverProps) {
    return (
        <Cover
            id={`${playlistId}/${index}/${coverKey}@${revision}`}
            urlFor={step => itemCoverUrl(playlistId, index, coverKey, step)}
            size={size}
            className={className}
            style={{ width: size, height: size, '--icon-size': `${Math.round(size * 0.6)}px` } as CSSProperties}
        />
    );
}

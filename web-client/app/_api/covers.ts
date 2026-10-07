import { basePath } from './helpers/request';

// The server only scales down, to any size; the fixed steps keep the browser's
// cache to one image per cover and density. The player's own copy is already
// scaled to its limit.
const coverSteps = [64, 128, 256, 512] as const;
export type CoverSize = (typeof coverSteps)[number] | 'player';

export const coverPixels = (size: CoverSize) => (size === 'player' ? Infinity : size);

function sizeQuery(size: CoverSize) {
    return size === 'player' ? '' : `size=${size}`;
}

export function coverUrl(hash: string, size: CoverSize): string {
    const query = sizeQuery(size);
    return `${basePath}/covers/${hash}${query && `?${query}`}`;
}

// Redirects to the image by its bytes, so the tracks of an album share one download.
export function itemCoverUrl(playlistId: string, index: number, key: string, size: CoverSize): string {
    const query = sizeQuery(size);
    return `${basePath}/playlists/${encodeURIComponent(playlistId)}/items/${index}/cover?key=${key}${query && `&${query}`}`;
}

// The step for a box of `cssPixels` on this screen: the first that is not smaller.
export function coverStep(cssPixels: number): CoverSize {
    const wanted = cssPixels * (typeof window === 'undefined' ? 1 : window.devicePixelRatio);
    return coverSteps.find(step => step >= wanted) ?? 'player';
}

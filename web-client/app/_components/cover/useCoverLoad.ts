import { useDebouncedValue } from '@/app/_hooks/useDebouncedValue';
import { useEffect, useReducer } from 'react';

export type CoverLoad = {
    // An object URL the img shows without a request of its own; none when the
    // server has no cover.
    objectUrl?: string;
};

// A load not wanted any more is cancelled, and one not wanted for long is never
// started: an img keeps every load it ever began, and a fast scroll through a
// long playlist, or a run through the tracks, would leave hundreds queued.
const settleDelay = 150;
// Between a load's key and URL in the debounced string; neither contains a newline.
const separator = String.fromCharCode(10);

// Loaded covers are kept, so that a row scrolled away and back shows its cover
// at once rather than through the placeholder again. They are kept by the URL
// the request ended at, which for an item is the image by its hash: the tracks
// of an album share one entry. Bounded by their bytes, the oldest going first;
// an entry without an image is charged for the room its URLs take.
const keepBytes = 16 * 1024 * 1024;
const minimumBytes = 1024;
const images = new Map<string, CoverLoad & { bytes: number }>();
// Which image each load ended at, by the load's key: a caller names a load so
// that a changed cover behind the same URL is asked for again.
const imageOf = new Map<string, string>();
let keptBytes = 0;

function lookUp(key: string): CoverLoad | undefined {
    const imageUrl = imageOf.get(key);
    const image = imageUrl === undefined ? undefined : images.get(imageUrl);
    if (image) {
        // The order of the map is the order of use.
        images.delete(imageUrl!);
        images.set(imageUrl!, image);
    }
    return image;
}

function remember(key: string, imageUrl: string, blob: Blob | undefined) {
    imageOf.set(key, imageUrl);
    if (images.has(imageUrl)) return;
    const entry = { objectUrl: blob && URL.createObjectURL(blob), bytes: Math.max(blob?.size ?? 0, minimumBytes) };
    images.set(imageUrl, entry);
    keptBytes += entry.bytes;
    for (const [oldest, old] of images) {
        if (keptBytes <= keepBytes) break;
        images.delete(oldest);
        keptBytes -= old.bytes;
        if (old.objectUrl) URL.revokeObjectURL(old.objectUrl);
    }
}

// Loads the cover at `url` through fetch, which can be cancelled, and keeps the
// result under `key`.
export function useCoverLoad(url: string | undefined, key = url): CoverLoad | undefined {
    const [, loaded] = useReducer((n: number) => n + 1, 0);
    // Debounced as one string: an object would be new on every render.
    const settled = useDebouncedValue(url && key ? `${key}${separator}${url}` : undefined, settleDelay);
    useEffect(() => {
        if (!settled) return;
        const [settledKey, settledUrl] = settled.split(separator);
        if (lookUp(settledKey)) return;
        const controller = new AbortController();
        (async () => {
            try {
                const response = await fetch(settledUrl, { signal: controller.signal });
                const blob = response.ok ? await response.blob() : undefined;
                if (controller.signal.aborted) return;
                remember(settledKey, response.url || settledUrl, blob);
                loaded();
            } catch {
                // Cancelled, or the network failed, which leaves the last image in place.
            }
        })();
        return () => controller.abort();
    }, [settled]);
    return key ? lookUp(key) : undefined;
}

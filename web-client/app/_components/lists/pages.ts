export const pageSize = 200;
const bufferPages = 1;

export function pageRange(page: number) {
    return { offset: page * pageSize, limit: pageSize };
}

// The pages that cover `positions`, the first and last on screen, and one more on
// each side.
export function pagesAround(positions: [number, number] | null, itemCount: number): number[] {
    if (!itemCount || !positions) return [];
    const lastPage = Math.max(0, Math.ceil(itemCount / pageSize) - 1);
    const first = Math.max(0, Math.floor(positions[0] / pageSize) - bufferPages);
    const last = Math.min(lastPage, Math.floor(positions[1] / pageSize) + bufferPages);
    return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

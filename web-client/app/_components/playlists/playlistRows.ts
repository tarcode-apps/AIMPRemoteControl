import type { PlaylistGroup } from '@/app/_api/types';

export type PlaylistRow =
    { kind: 'group'; group: PlaylistGroup } | { kind: 'item'; position: number; group?: PlaylistGroup };

// Names a row by what it shows, so that it survives groups folding.
export type PlaylistRowKey = { kind: 'item'; position: number } | { kind: 'group'; index: number };

export type RowSpan = {
    startRow: number;
    rowCount: number;
};

type GroupSpan = RowSpan & {
    group: PlaylistGroup;
};

// Maps virtual rows to group headers and item positions. Groups are contiguous
// runs of the playlist, so a span is one header row plus the group's items when
// it is expanded; a flat playlist is a single anonymous span.
export class PlaylistRows {
    private readonly spans: GroupSpan[] = [];
    readonly count: number;

    constructor(itemCount: number, groups: PlaylistGroup[] | undefined) {
        let row = 0;
        if (!groups?.length) {
            this.count = itemCount;
            return;
        }
        for (const group of groups) {
            const rowCount = 1 + (group.expanded ? group.count : 0);
            this.spans.push({ group, startRow: row, rowCount });
            row += rowCount;
        }
        this.count = row;
    }

    at(row: number): PlaylistRow {
        const span = this.spanOf(row);
        if (!span) return { kind: 'item', position: row };
        const { group, startRow } = span;
        if (row === startRow) return { kind: 'group', group };
        return { kind: 'item', position: group.firstPosition + row - startRow - 1, group };
    }

    // The group `row` belongs to, header included; null in a flat playlist.
    spanAt(row: number): RowSpan | null {
        const span = this.spanOf(row);
        return span && { startRow: span.startRow, rowCount: span.rowCount };
    }

    keyAt(row: number): PlaylistRowKey {
        const entry = this.at(row);
        return entry.kind === 'group'
            ? { kind: 'group', index: entry.group.index }
            : { kind: 'item', position: entry.position };
    }

    // The row showing `key`; an item folded away is stood in for by its group's
    // header. Null when the key names nothing in this layout.
    rowOf(key: PlaylistRowKey): number | null {
        if (key.kind === 'group') return this.spans.find(span => span.group.index === key.index)?.startRow ?? null;
        if (!this.spans.length) return key.position;
        const span = this.spanBefore(key.position, span => span.group.firstPosition);
        if (!span || key.position >= span.group.firstPosition + span.group.count) return null;
        return span.group.expanded ? span.startRow + 1 + key.position - span.group.firstPosition : span.startRow;
    }

    positions(fromRow: number, toRow: number): [number, number] | null {
        let first: number | null = null;
        let last: number | null = null;
        for (let row = fromRow; row <= toRow; row++) {
            const entry = this.at(row);
            if (entry.kind !== 'item') continue;
            first ??= entry.position;
            last = entry.position;
        }
        return first === null || last === null ? null : [first, last];
    }

    private spanOf(row: number): GroupSpan | null {
        return this.spanBefore(row, span => span.startRow);
    }

    // The last span whose `keyOf` does not exceed `value`; the spans are sorted by
    // rows and by positions alike.
    private spanBefore(value: number, keyOf: (span: GroupSpan) => number): GroupSpan | null {
        if (!this.spans.length) return null;
        let low = 0;
        let high = this.spans.length - 1;
        while (low < high) {
            const mid = (low + high + 1) >> 1;
            if (keyOf(this.spans[mid]) <= value) low = mid;
            else high = mid - 1;
        }
        return this.spans[low];
    }
}

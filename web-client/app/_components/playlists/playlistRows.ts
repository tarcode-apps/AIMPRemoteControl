import type { PlaylistGroup } from '@/app/_api/types';

export type PlaylistRow =
    { kind: 'group'; group: PlaylistGroup } | { kind: 'item'; position: number; group?: PlaylistGroup };

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
        if (!this.spans.length) return null;
        let low = 0;
        let high = this.spans.length - 1;
        while (low < high) {
            const mid = (low + high + 1) >> 1;
            if (this.spans[mid].startRow <= row) low = mid;
            else high = mid - 1;
        }
        return this.spans[low];
    }
}

import { useState } from 'react';

// Keys for the rows of a virtual list that hand the elements of a row leaving
// the view to a row entering it, as Android's RecyclerView does: React then
// updates a row rather than builds one, which in a fast scroll is most of the
// work. A row keeps its key for as long as it stays in view, and only rows of
// one kind trade keys. With `recycle` off an entering row takes a key never
// used, for while rows move by transition: an element given to a far row would
// fly across the list.
export function useRowKeys(
    indexes: readonly number[],
    kindOf: (index: number) => string,
    recycle = true,
): (index: number) => string {
    const [keys] = useState(() => new RowKeys());
    return keys.assign(indexes, kindOf, recycle);
}

// Each render hands out the keys from the last one's: a render React throws
// away leaves the keys of rows it would have shown, all still distinct.
class RowKeys {
    private keys = new Map<number, string>();
    private next = 0;

    assign(indexes: readonly number[], kindOf: (index: number) => string, recycle: boolean) {
        const kept = new Map<number, string>();
        const entering: number[] = [];
        for (const index of indexes) {
            const key = this.keys.get(index);
            if (key !== undefined && key.startsWith(`${kindOf(index)}:`)) kept.set(index, key);
            else entering.push(index);
        }
        const free = new Map<string, string[]>();
        if (recycle)
            for (const [index, key] of this.keys) {
                if (kept.get(index) === key) continue;
                const kind = key.slice(0, key.indexOf(':'));
                const list = free.get(kind);
                if (list) list.push(key);
                else free.set(kind, [key]);
            }
        for (const index of entering) {
            const kind = kindOf(index);
            kept.set(index, free.get(kind)?.pop() ?? `${kind}:${this.next++}`);
        }
        this.keys = kept;
        return (index: number) => kept.get(index)!;
    }
}

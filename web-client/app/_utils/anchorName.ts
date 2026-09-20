// A CSS anchor name unique to a component instance. `useId` values carry characters
// that a dashed-ident may not.
export function anchorName(prefix: string, id: string) {
    return `--${prefix}-${id.replace(/[^a-zA-Z0-9-]/g, '')}`;
}

import type { UploadFile } from '@/app/_api/types';

// What the systems leave in folders for themselves, besides the names starting
// with a dot (.DS_Store, ._* and the like of macOS and Linux): the browser does
// not tell a file hidden on Windows, so those go by name. `Icon\r` holds the icon
// macOS gives a folder; `__MACOSX` comes out of a zip packed on a Mac; the last
// two lie in the root of a drive.
const systemEntries = new Set([
    'thumbs.db',
    'ehthumbs.db',
    'ehthumbs_vista.db',
    'desktop.ini',
    'icon\r',
    '__macosx',
    '$recycle.bin',
    'system volume information',
]);

const collator = new Intl.Collator(undefined, { numeric: true });

// Folder by folder, so that "Album/…" stays before "Album 2/…".
function comparePaths(a: string, b: string) {
    const left = a.split('/');
    const right = b.split('/');
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
        const order = collator.compare(left[i], right[i]);
        if (order) return order;
    }
    return left.length - right.length;
}

function isSystemEntry(name: string) {
    return name.startsWith('.') || systemEntries.has(name.toLowerCase());
}

function fileOf(entry: FileSystemFileEntry) {
    return new Promise<File>((resolve, reject) => entry.file(resolve, reject));
}

// A folder hands its entries out a batch at a time, until an empty one.
async function entriesOf(folder: FileSystemDirectoryEntry) {
    const reader = folder.createReader();
    const entries: FileSystemEntry[] = [];
    for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (batch.length === 0) return entries;
        entries.push(...batch);
    }
}

async function filesUnder(entry: FileSystemEntry, parent: string): Promise<UploadFile[]> {
    if (isSystemEntry(entry.name)) return [];
    const path = parent + entry.name;
    if (entry.isFile) return [{ file: await fileOf(entry as FileSystemFileEntry), path }];
    const entries = await entriesOf(entry as FileSystemDirectoryEntry);
    return (await Promise.all(entries.map(child => filesUnder(child, `${path}/`)))).flat();
}

// Every file of a drop, those in its folders too, in the order of their paths.
// The entries are taken at once: the drop's items are gone once its event is over.
export function readDroppedFiles(dataTransfer: DataTransfer): Promise<UploadFile[]> {
    const entries = [...dataTransfer.items].flatMap(item => {
        const entry = item.kind === 'file' ? item.webkitGetAsEntry() : null;
        return entry ? [entry] : [];
    });
    return Promise.all(entries.map(entry => filesUnder(entry, ''))).then(files =>
        files.flat().sort((a, b) => comparePaths(a.path, b.path)),
    );
}

// Files picked in a dialog, which have no folders.
export function pickedFiles(files: FileList): UploadFile[] {
    return [...files].map(file => ({ file, path: file.name }));
}

export function totalSize(files: UploadFile[]) {
    return files.reduce((sum, { file }) => sum + file.size, 0);
}

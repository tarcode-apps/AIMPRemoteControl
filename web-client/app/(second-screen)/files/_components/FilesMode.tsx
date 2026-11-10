'use client';

import { useAddItems, useFolder } from '@/app/_api/files';
import { ApiError } from '@/app/_api/helpers/errors';
import {
    filesSortModes,
    type FileEntry,
    type FileRoot,
    type FilesSort,
    type FileType,
    type FolderEntry,
    type Playlist,
} from '@/app/_api/types';
import { usePersistedState } from '@/app/_hooks/usePersistedState';
import { secondScreenDepth, useNavigation } from '@/app/_state/Navigation';
import { usePlaylistSelection } from '@/app/_state/PlaylistSelection';
import { useSearchParams } from 'next/navigation';
import { createContext, useContext, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';

export type FilesModeContextValue = {
    // The playlist the picked files go to.
    playlist: Playlist | undefined;
    type: FileType;
    // The folder shown; empty for the roots.
    path: string;
    roots: FileRoot[] | undefined;
    // Of the folder shown, in the order the server was asked for.
    folders: FolderEntry[];
    files: FileEntry[];
    pending: boolean;
    error: Error | null;
    refetch(): void;
    open(path: string): void;
    // To the parent folder, or to the roots.
    up(): void;
    // Straight to the roots.
    home(): void;
    sort: FilesSort;
    setSort(sort: FilesSort): void;
    // The folders and files picked in the folder shown, by path.
    selected: ReadonlySet<string>;
    allSelected: boolean;
    setSelected(path: string, selected: boolean): void;
    setAllSelected(selected: boolean): void;
    // Adds what was picked, the folders as a whole, and shows the playlist.
    addSelected(): void;
    // Shows the playlist without adding anything.
    leave(): void;
    adding: boolean;
    addError: Error | null;
};

const FilesModeContext = createContext<FilesModeContextValue | null>(null);

export function useFilesMode(): FilesModeContextValue {
    const value = useContext(FilesModeContext);
    if (!value) throw new Error('useFilesMode must be used inside <FilesModeProvider>');
    return value;
}

// Every folder entered is a history entry of its own over the screen's, marked
// with its path and how many such entries there are, so that each back goes up
// one folder and the roots are a known number of entries down. The keys count
// as layer marks, which the navigation strips from the entries it makes.
const pathKey = 'back-filesPath';
const levelKey = 'back-filesLevel';

type Folder = {
    path: string;
    level: number; // entries over the screen's own; 0 at the roots
};

const roots: Folder = { path: '', level: 0 };

function shownFolder(): Folder {
    const state: unknown = window.history.state;
    const { [pathKey]: path, [levelKey]: level } = (state ?? {}) as Record<string, unknown>;
    return typeof path === 'string' && typeof level === 'number' ? { path, level } : roots;
}

function writeFolder(folder: Folder, replace: boolean) {
    const state = { ...window.history.state, [pathKey]: folder.path, [levelKey]: folder.level };
    if (replace) window.history.replaceState(state, '');
    else window.history.pushState(state, '');
}

const noSelection: ReadonlySet<string> = new Set();
const noEntries: never[] = [];
const defaultSort: FilesSort = { by: 'name', descending: false };
const parsePath = (stored: unknown) => (typeof stored === 'string' ? stored : undefined);
function parseSort(stored: unknown): FilesSort | undefined {
    if (typeof stored !== 'object' || stored === null) return undefined;
    const { by, descending } = stored as Partial<FilesSort>;
    if (!by || !filesSortModes.includes(by) || typeof descending !== 'boolean') return undefined;
    return { by, descending };
}

export function FilesModeProvider({ children }: { children: ReactNode }) {
    const searchParams = useSearchParams();
    const { playlists, select } = usePlaylistSelection();
    const { openScreen, walking, entryDepth } = useNavigation();
    const playlistId = searchParams.get('to');
    const playlist = playlists?.find(candidate => candidate.id === playlistId);
    const type: FileType = searchParams.get('types') === 'playlist' ? 'playlist' : 'audio';
    // The folder last looked at is where the next visit starts.
    const [lastPath, setLastPath] = usePersistedState('files.lastPath', '', parsePath);
    // Arriving on an entry that already names a folder, as a reload or a forward
    // does, shows that folder; otherwise the one last looked at.
    const [folder, setFolder] = useState<Folder>(() => {
        const shown = typeof window === 'undefined' ? roots : shownFolder();
        return shown.level > 0 ? shown : { path: lastPath, level: 0 };
    });
    const [sort, setSort] = usePersistedState('files.sort', defaultSort, parseSort);
    const query = useFolder(folder.path, [type], sort);
    const listing = query.data;
    const [selection, setSelection] = useState<{ path: string; entries: ReadonlySet<string> }>({
        path: folder.path,
        entries: noSelection,
    });
    const selected = selection.path === folder.path ? selection.entries : noSelection;
    const add = useAddItems();

    const showFolder = (next: Folder) => {
        setFolder(next);
        setLastPath(next.path);
    };

    // The folder restored on arrival gets an entry too, so that back leads to the
    // roots from it. Deferred past the navigation's own bookkeeping of the entry
    // the screen arrived on, which runs after the effects of its children.
    const started = useRef(false);
    const restoredPath = useRef<string | null>(null);
    useEffect(() => {
        if (started.current) return;
        started.current = true;
        restoredPath.current = folder.path || null;
        const timer = window.setTimeout(() => {
            if (shownFolder().level === 0 && folder.path) {
                const restored = { path: folder.path, level: 1 };
                writeFolder(restored, false);
                setFolder(restored);
            }
        });
        return () => window.clearTimeout(timer);
    }, [folder.path]);

    // Back and forward move through the folders; the steps of a navigation away
    // from the screen, and its landing elsewhere, are not the user's folder changes.
    const onPopState = useEffectEvent(() => {
        if (walking() || entryDepth() !== secondScreenDepth) return;
        showFolder(shownFolder());
    });
    useEffect(() => {
        const listener = () => onPopState();
        window.addEventListener('popstate', listener);
        return () => window.removeEventListener('popstate', listener);
    }, []);

    // Shown at once; the entries popped carry the same folders.
    const home = () => {
        const { level } = folder;
        showFolder(roots);
        if (level > 0) window.history.go(-level);
    };

    // A remembered folder that is gone gives way to the roots; a folder opened
    // here that cannot be read shows its error instead.
    useEffect(() => {
        if (query.error instanceof ApiError && query.error.status === 404 && folder.path === restoredPath.current) {
            restoredPath.current = null;
            home();
        }
    });

    const open = (path: string) => {
        const next = { path, level: folder.level + 1 };
        writeFolder(next, false);
        showFolder(next);
    };

    // The entry under a folder entered from here is its parent; under a restored
    // folder there is only the roots, so its ancestors take its place instead.
    const up = () => {
        if (folder.level === 1 && listing?.parent) {
            const parent = { path: listing.parent, level: 1 };
            writeFolder(parent, true);
            showFolder(parent);
        } else if (folder.level > 0) {
            if (folder.level === 1) showFolder(roots);
            else if (listing?.parent) showFolder({ path: listing.parent, level: folder.level - 1 });
            window.history.back();
        } else showFolder(roots);
    };

    const folders = listing?.folders ?? noEntries;
    const files = listing?.files ?? noEntries;
    const paths = () => [...folders.map(entry => entry.path), ...files.map(entry => entry.path)];
    const allSelected = folders.length + files.length > 0 && paths().every(entry => selected.has(entry));
    const setSelected = (entry: string, isSelected: boolean) => {
        const next = new Set(selected);
        if (isSelected) next.add(entry);
        else next.delete(entry);
        setSelection({ path: folder.path, entries: next });
    };
    const setAllSelected = (isSelected: boolean) =>
        setSelection({ path: folder.path, entries: isSelected ? new Set(paths()) : noSelection });

    // The playlist is shown whatever lies under this screen in the history.
    const leave = () => {
        if (playlist) select(playlist.id);
        openScreen('/');
    };
    const addSelected = () => {
        if (!playlist || add.isPending || selected.size === 0) return;
        // A failure stays on the screen, in its notice (addError).
        add.mutate({ playlistId: playlist.id, files: [...selected] }, { onSuccess: leave });
    };

    const value: FilesModeContextValue = {
        playlist,
        type,
        path: folder.path,
        roots: listing?.roots,
        folders,
        files,
        pending: query.isPending,
        error: query.error,
        refetch: () => void query.refetch(),
        open,
        up,
        home,
        sort,
        setSort,
        selected,
        allSelected,
        setSelected,
        setAllSelected,
        addSelected,
        leave,
        adding: add.isPending,
        addError: add.error,
    };
    return <FilesModeContext value={value}>{children}</FilesModeContext>;
}

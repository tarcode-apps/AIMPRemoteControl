'use client';

import type { ItemDetails, SortBy } from '@/app/_api/types';
import { readPersisted, usePersistedState, writePersisted } from '@/app/_hooks/usePersistedState';
import { useSyncExternalStore } from 'react';

// A favorite is a snapshot of a track bound to the playlist it was taken from: it
// plays from that playlist only, and shows the snapshot while it is not there.
export type FavoriteRecord = {
    fileUri: string;
    playlistId: string;
    playlistName: string;
    displayText: string;
    secondLine: string;
    duration: number;
    size: number;
    isUrl: boolean;
    artist: string;
    album: string;
    genre: string;
    year: string;
    folder: string;
};

export type FavoritesGrouping = 'playlist' | 'artist' | 'album' | 'genre' | 'year' | 'folder';

export const favoritesGroupings: readonly FavoritesGrouping[] = [
    'playlist',
    'artist',
    'album',
    'genre',
    'year',
    'folder',
];

type FavoritesState = {
    records: FavoriteRecord[];
    grouping: FavoritesGrouping;
    // Counts the changes; a drag settles once it moves on.
    revision: number;
};

const key = 'favorites.v1';
const empty: FavoritesState = { records: [], grouping: 'playlist', revision: 0 };

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

function parseRecord(stored: unknown): FavoriteRecord | undefined {
    if (typeof stored !== 'object' || stored === null) return undefined;
    const record = stored as Record<string, unknown>;
    if (typeof record.fileUri !== 'string' || typeof record.playlistId !== 'string') return undefined;
    return {
        fileUri: record.fileUri,
        playlistId: record.playlistId,
        playlistName: text(record.playlistName),
        displayText: text(record.displayText),
        secondLine: text(record.secondLine),
        duration: number(record.duration),
        size: number(record.size),
        isUrl: record.isUrl === true,
        artist: text(record.artist),
        album: text(record.album),
        genre: text(record.genre),
        year: text(record.year),
        folder: text(record.folder),
    };
}

function parseState(stored: unknown): FavoritesState | undefined {
    if (typeof stored !== 'object' || stored === null) return undefined;
    const { records, grouping, revision } = stored as Partial<FavoritesState>;
    if (!Array.isArray(records)) return undefined;
    const seen = new Set<string>();
    const kept: FavoriteRecord[] = [];
    for (const entry of records) {
        const record = parseRecord(entry);
        if (!record || seen.has(record.fileUri)) continue;
        seen.add(record.fileUri);
        kept.push(record);
    }
    return {
        records: kept,
        grouping: favoritesGroupings.includes(grouping as FavoritesGrouping) ? grouping! : 'playlist',
        revision: number(revision),
    };
}

export function toRecord(details: ItemDetails, playlistId: string, playlistName: string): FavoriteRecord {
    return {
        fileUri: details.fileUri,
        playlistId,
        playlistName,
        displayText: details.displayText,
        secondLine: details.secondLine,
        duration: details.duration,
        size: details.size,
        isUrl: details.isUrl,
        artist: details.artist,
        album: details.album,
        genre: details.genre,
        year: details.year,
        folder: details.folder,
    };
}

const readState = () => readPersisted(key, empty, parseState);

// The records as they are now, for code outside React.
export function favoriteRecords(): FavoriteRecord[] {
    return readState().records;
}

// Every change reads the stored state afresh, so that two changes in one tick
// do not lose each other.
function update(change: (state: FavoritesState) => FavoritesState) {
    const current = readState();
    const next = change(current);
    if (next !== current) writePersisted(key, { ...next, revision: current.revision + 1 });
}

export type FavoritesSortBy = Extract<SortBy, 'title' | 'fileName' | 'duration' | 'artist' | 'inverse' | 'random'>;

export const favoritesSortModes: readonly FavoritesSortBy[] = [
    'title',
    'fileName',
    'duration',
    'artist',
    'inverse',
    'random',
];

const fileName = (fileUri: string) => fileUri.slice(Math.max(fileUri.lastIndexOf('/'), fileUri.lastIndexOf('\\')) + 1);

const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

function sorted(records: FavoriteRecord[], by: FavoritesSortBy, descending: boolean): FavoriteRecord[] {
    let compare: (a: FavoriteRecord, b: FavoriteRecord) => number;
    switch (by) {
        case 'inverse':
            return [...records].reverse();
        case 'random': {
            const shuffled = [...records];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled;
        }
        case 'title':
            compare = (a, b) => compareText(a.displayText, b.displayText);
            break;
        case 'fileName':
            compare = (a, b) => compareText(fileName(a.fileUri), fileName(b.fileUri));
            break;
        case 'artist':
            compare = (a, b) => compareText(a.artist, b.artist);
            break;
        case 'duration':
            compare = (a, b) => a.duration - b.duration;
            break;
    }
    const result = [...records].sort(compare);
    return descending ? result.reverse() : result;
}

// The records' files as a set, built once for every reader of the same records.
const fileSets = new WeakMap<FavoriteRecord[], ReadonlySet<string>>();

function filesOf(records: FavoriteRecord[]) {
    let files = fileSets.get(records);
    if (!files) {
        files = new Set(records.map(record => record.fileUri));
        fileSets.set(records, files);
    }
    return files;
}

export function useFavorites() {
    const [{ records, grouping, revision }] = usePersistedState(key, empty, parseState);

    return {
        records,
        grouping,
        revision,
        has: (fileUri: string) => filesOf(records).has(fileUri),
        // Files already there are left as they are.
        add(added: FavoriteRecord[]) {
            update(current => {
                const known = new Set(filesOf(current.records));
                const fresh = added.filter(record => {
                    if (known.has(record.fileUri)) return false;
                    known.add(record.fileUri);
                    return true;
                });
                return fresh.length ? { ...current, records: [...current.records, ...fresh] } : current;
            });
        },
        remove(removed: Iterable<string>) {
            const gone = new Set(removed);
            update(current => ({ ...current, records: current.records.filter(record => !gone.has(record.fileUri)) }));
        },
        // The new record takes the old one's place, unless its file is already
        // there, in which case the old one just goes.
        replace(fileUri: string, record: FavoriteRecord) {
            update(current => {
                const duplicate = record.fileUri !== fileUri && filesOf(current.records).has(record.fileUri);
                return {
                    ...current,
                    records: current.records.flatMap(known =>
                        known.fileUri === fileUri ? (duplicate ? [] : [record]) : [known],
                    ),
                };
            });
        },
        // Moves the records with these files so that the first of them ends up at
        // `target`, keeping their relative order, as the playlist move does.
        move(fileUris: string[], target: number) {
            const moved = new Set(fileUris);
            update(current => {
                const taken = current.records.filter(record => moved.has(record.fileUri));
                const rest = current.records.filter(record => !moved.has(record.fileUri));
                const at = Math.min(Math.max(target, 0), rest.length);
                return { ...current, records: [...rest.slice(0, at), ...taken, ...rest.slice(at)] };
            });
        },
        sort(by: FavoritesSortBy, descending: boolean) {
            update(current => ({ ...current, records: sorted(current.records, by, descending) }));
        },
        clear() {
            update(current => ({ ...current, records: [] }));
        },
        setGrouping(grouping: FavoritesGrouping) {
            update(current => ({ ...current, grouping }));
        },
    };
}

// The favorite being re-linked, by its file: the extended search runs as a picker
// for it, and the chosen track replaces the record.
let relinking: string | null = null;
const relinkListeners = new Set<() => void>();

function setRelinking(fileUri: string | null) {
    relinking = fileUri;
    for (const listener of relinkListeners) listener();
}

function subscribeRelinking(listener: () => void) {
    relinkListeners.add(listener);
    return () => {
        relinkListeners.delete(listener);
    };
}

const startRelink = (fileUri: string) => setRelinking(fileUri);
const finishRelink = () => setRelinking(null);

export function useFavoriteRelink() {
    const current = useSyncExternalStore(
        subscribeRelinking,
        () => relinking,
        () => null,
    );
    return { relinking: current, startRelink, finishRelink };
}

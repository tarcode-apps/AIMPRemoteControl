import type { Api } from './api';

// What the frozen protocol calls things: integer ids derived from the player's
// own, and entries as arrays in the order of the fields asked for
// (docs/remote-control-protocol.md).

export type LegacyPlaylist = {
    id: number;
    title: string;
    readonly: boolean;
    entries_count: number;
    crc32: number;
};

export async function legacyPlaylists(api: Api): Promise<LegacyPlaylist[]> {
    return api.rpcResult<LegacyPlaylist[]>('GetPlaylists', {
        fields: ['id', 'title', 'readonly', 'entries_count', 'crc32'],
    });
}

// The legacy id of a playlist, found by its unique name.
export async function legacyPlaylistId(api: Api, title: string): Promise<number> {
    const found = (await legacyPlaylists(api)).filter(playlist => playlist.title === title);
    if (found.length !== 1) throw new Error(`${found.length} legacy playlists are named ${title}`);
    return found[0].id;
}

export type LegacyEntries = {
    count_of_found_entries: number;
    total_entries_count?: number;
    entries: unknown[][];
};

// The entries of a playlist as objects keyed by the fields asked for.
export async function legacyEntries<F extends string>(
    api: Api,
    playlistId: number,
    fields: F[],
): Promise<Record<F, unknown>[]> {
    const result = await api.rpcResult<LegacyEntries>('GetPlaylistEntries', { playlist_id: playlistId, fields });
    return result.entries.map(
        row => Object.fromEntries(fields.map((field, i) => [field, row[i]])) as Record<F, unknown>,
    );
}

// The track ids of a playlist's entries, in order.
export async function legacyTrackIds(api: Api, playlistId: number): Promise<number[]> {
    return (await legacyEntries(api, playlistId, ['id'])).map(entry => entry.id as number);
}

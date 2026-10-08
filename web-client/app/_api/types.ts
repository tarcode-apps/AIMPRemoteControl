export type PlaylistGrouping = {
    enabled: boolean;
    template: string;
    autoMerge: boolean;
};

export type Playlist = {
    id: string;
    name: string;
    readOnly: boolean;
    itemCount: number;
    duration: number;
    size: number;
    revision: number;
    showNumbers: boolean;
    absoluteNumbers: boolean;
    showDuration: boolean;
    showSecondLine: boolean;
    showThumbnails: boolean;
    grouping: PlaylistGrouping;
};

export type PlaylistItem = {
    index: number;
    displayText: string;
    secondLine: string;
    duration: number;
    size: number;
    rating: number;
    enabled: boolean;
    isUrl: boolean;
    // Names the cover in its URL; changes when the tags are written.
    cover: string;
    // The URI as the player stores it: the one stable name of a track, compared
    // byte for byte.
    fileUri: string;
};

// An item with the tags a client keeps for lists of its own.
export type ItemDetails = PlaylistItem & {
    artist: string;
    album: string;
    genre: string;
    year: string;
    folder: string;
};

export type ItemDetailsResponse = {
    items: ItemDetails[];
};

export type LocateRequest = {
    fileUri: string;
    playlistId: string;
};

// A remembered file found in its playlist, at the playlist's `revision`.
export type LocatedItem = PlaylistItem & {
    playlistId: string;
    revision: number;
};

export type LocateResponse = {
    found: LocatedItem[];
};

export type PlaylistItemsPage = {
    total: number;
    revision: number;
    offset: number;
    items: PlaylistItem[];
    // Of every match, with a search only.
    duration?: number;
    size?: number;
};

export type PlaylistGroup = {
    index: number;
    name: string;
    count: number;
    duration: number;
    size: number;
    expanded: boolean;
    firstPosition: number;
};

export type PlaylistGroups = {
    revision: number;
    groups: PlaylistGroup[];
};

export type SortBy =
    | 'title'
    | 'fileName'
    | 'duration'
    | 'artist'
    | 'inverse'
    | 'random'
    | 'randomGroups'
    | 'randomGroupItems'
    | 'randomAll'
    | 'template';

export const sortModes: readonly SortBy[] = [
    'title',
    'fileName',
    'duration',
    'artist',
    'template',
    'inverse',
    'random',
    'randomGroups',
    'randomGroupItems',
    'randomAll',
];

// The orders `descending` applies to.
export const fieldSorts: readonly SortBy[] = ['title', 'fileName', 'duration', 'artist', 'template'];

export type SortRequest = {
    by: SortBy;
    template?: string;
    descending?: boolean;
    revision?: number;
};

export type MoveRequest = {
    indexes: number[];
    // The index the first moved item gets in the resulting playlist.
    target: number;
    revision?: number;
};

// The texts a search looks through, as the extended search names them.
export type SearchField = 'title' | 'artist' | 'album' | 'genre' | 'file';

export const searchFields: readonly SearchField[] = ['title', 'artist', 'album', 'genre', 'file'];

// Which items of a playlist a request means: these indexes, or everything the
// search finds but the indexes in `except`. With `fields` the search is the
// extended one, without it the playlist's own.
export type ItemSelection =
    | { indexes: number[] }
    | {
          // Everything when empty.
          search: string;
          fields?: SearchField[];
          // Only the matches in these groups of the playlist.
          groups?: number[];
          except: number[];
          // Items besides the matches.
          indexes?: number[];
      };

export type SearchHit = PlaylistItem & {
    playlistId: string;
    // The playlist's, which `index` belongs to.
    revision: number;
};

export type SearchPlaylist = ItemsSummary & {
    id: string;
    revision: number;
};

// One page of the extended search; `total`, `duration` and `size` cover every
// match, `playlists` lists those with matches in the order the hits come.
export type SearchPage = {
    total: number;
    duration: number;
    size: number;
    items: SearchHit[];
    playlists: SearchPlaylist[];
};

export type ItemsSummary = {
    count: number;
    duration: number;
    size: number;
};

// An entry of the playback queue: the same track may be queued several times, so
// an entry is named by its position.
export type QueueItem = PlaylistItem & {
    position: number;
    playlistId: string;
};

export type Queue = {
    revision: number;
    // Kept but not played from.
    suspended: boolean;
    items: QueueItem[];
};

// The part of a selection that lies in one playlist, as that playlist's requests
// take it.
export type SelectionInPlaylist = {
    playlistId: string;
    revision?: number;
    selection: ItemSelection;
};

export type EnqueueRequest = ItemSelection & {
    playlistId: string;
    atBeginning?: boolean;
    revision?: number;
};

export type QueueRemoveRequest = {
    positions: number[];
    revision?: number;
};

export type QueueMoveRequest = {
    positions: number[];
    // The position the first moved entry gets in the resulting queue.
    target: number;
    revision?: number;
};

export type PlaybackState = 'playing' | 'paused' | 'stopped';

export type RepeatMode = 'off' | 'playlist' | 'track';

export type PlayingTrack = {
    playlistId: string;
    // `index` is only valid for this revision of the playlist.
    playlistRevision: number;
    index: number;
    // As tagged, "3" or "3/12"; empty without a tag.
    trackNumber: string;
    title: string;
    artist: string;
    album: string;
    isUrl: boolean;
    // The image by its bytes: the same across the tracks of an album, empty without a cover.
    coverHash: string;
    fileUri: string;
};

export type PlayerState = {
    state: PlaybackState;
    position: number;
    duration: number;
    volume: number;
    mute: boolean;
    repeat: RepeatMode;
    shuffle: boolean;
    radioCapture: boolean;
    // Empty while stopped, as the player's own window is.
    track: PlayingTrack | null;
};

export type PlayerCommand = 'play' | 'pause' | 'stop' | 'next' | 'previous';

export type PlayTrackRequest = {
    playlistId: string;
    index: number;
    revision?: number;
};

export type PlayerPatch = Partial<Pick<PlayerState, 'position' | 'volume' | 'mute' | 'repeat' | 'shuffle'>>;

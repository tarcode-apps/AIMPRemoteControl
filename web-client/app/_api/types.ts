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
};

export type PlaylistItemsPage = {
    total: number;
    revision: number;
    offset: number;
    items: PlaylistItem[];
};

export type PlaylistGroup = {
    index: number;
    name: string;
    count: number;
    duration: number;
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

// Which items of a playlist a request means: these indexes, or everything the
// search finds but the indexes in `except`.
export type ItemSelection = { indexes: number[] } | { search: string; except: number[] };

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

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
    // The player's name for showing the marks in the rows.
    showMarks: boolean;
    // The check boxes that take tracks out of playback; hidden, the player
    // plays every track whatever its switch says.
    showSwitches: boolean;
    grouping: PlaylistGrouping;
};

export type ItemMarkRequest = {
    playlistId: string;
    index: number;
    // The user's stars, 0..5; 0 takes them away.
    mark: number;
};

export type ItemEnabledRequest = {
    playlistId: string;
    index: number;
    enabled: boolean;
};

export type ItemsEnabledRequest = ItemSelection & {
    playlistId: string;
    revision?: number;
    enabled: boolean;
};

export type CreatedPlaylist = {
    id: string;
};

export type PlaylistRename = {
    id: string;
    name: string;
};

export type PlaylistItem = {
    index: number;
    displayText: string;
    secondLine: string;
    duration: number;
    size: number;
    // The stars the user gave, the player's own rating of the track (0..1), and
    // what the player shows, in halves of a star: the mark, or the rating as stars
    // when there is none, drawn hollow.
    mark: number;
    rating: number;
    displayingMark: number;
    enabled: boolean;
    isUrl: boolean;
    // A part of a container file, such as one track of a CUE sheet.
    inContainer: boolean;
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

// What the player's own track information window shows: the tags, read from
// the file itself, the stream's parameters and the player's statistics. Every
// tag is a string, empty when missing; a parameter the player does not know is 0.
export type TrackInfo = {
    playlistId: string;
    // Where the item is right now, for its cover.
    revision: number;
    index: number;
    fileUri: string;
    fileName: string;
    isUrl: boolean;
    inContainer: boolean;
    cover: string;
    title: string;
    artist: string;
    album: string;
    albumArtist: string;
    genre: string;
    year: string;
    trackNumber: string;
    lyricist: string;
    // The codec, or the audio file's extension when the tags name none.
    format: string;
    sampleRate: number; // Hz
    bitrate: number; // kbps
    bitDepth: number;
    channels: number;
    duration: number; // seconds
    size: number; // bytes
    playCount: number;
    // ISO 8601 in UTC; null for a track that has not played yet.
    lastPlayed: string | null;
};

export type LyricsLine = {
    text: string;
    // The second from the track's start at which the line is sung; synced lyrics only.
    time?: number;
};

export type Lyrics = {
    type: 'none' | 'unsynced' | 'synced';
    lines: LyricsLine[];
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
    // Of `count`, the items whose switch is on.
    enabledCount: number;
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
    inContainer: boolean;
    mark: number;
    rating: number;
    displayingMark: number;
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

// Where the player's own window stands; `index` is null when the playlist has no
// item to point at.
export type PlayerCursor = {
    playlistId: string;
    index: number | null;
};

export type PlayerCommand = 'play' | 'pause' | 'stop' | 'next' | 'previous';

export type PlayTrackRequest = {
    playlistId: string;
    index: number;
    revision?: number;
};

export type PlayerPatch = Partial<
    Pick<PlayerState, 'position' | 'volume' | 'mute' | 'repeat' | 'shuffle' | 'radioCapture'>
>;

// What the plugin's options page lets a client do.
export type Permissions = {
    downloadTracks: boolean;
    uploadTracks: boolean;
    browseFiles: boolean;
    physicalDeletion: boolean;
    scheduler: boolean;
};

export type Settings = {
    permissions: Permissions;
    // The largest upload body, in bytes.
    uploadLimit: number;
    // The most files one upload may carry.
    uploadFileLimit: number;
};

// Where the new items of an upload go in its playlist; `at` is before the item at
// an index of the revision.
export type UploadPlacement = { kind: 'end' | 'start' | 'scatter' } | { kind: 'at'; index: number };

// A playlist of the player, or a new one that the player names by its content.
export type UploadTarget = { playlistId: string; placement: UploadPlacement } | { playlistId: null };

// A file with its path relative to what the user picked: its folders, then its name.
export type UploadFile = { file: File; path: string };

// What the sleep timer does at its moment.
export type TimerAction = 'pause' | 'closePlayer' | 'shutdown' | 'sleep' | 'hibernate' | 'reboot' | 'logOff';
// The actions done to the computer, of which a timer takes one at most.
export const machineActions: readonly TimerAction[] = ['shutdown', 'sleep', 'hibernate', 'reboot', 'logOff'];
// What brings the moment: a delay, a time, or the end of the playing track, its
// playlist or the playback queue.
export type TimerTrigger = 'after' | 'at' | 'trackEnd' | 'playlistEnd' | 'queueEnd';
export const timerTriggers: readonly TimerTrigger[] = ['after', 'at', 'trackEnd', 'playlistEnd', 'queueEnd'];

export type ActiveTimer = {
    actions: TimerAction[];
    trigger: TimerTrigger;
    // The moment and when it was set, in milliseconds since the Unix epoch; for
    // `after` and `at` only.
    expiresAt?: number;
    setAt?: number;
    // A track playing at the moment finishes first.
    waitTrackEnd?: boolean;
    // The moment has come and the track is being let finish.
    waitingTrackEnd?: boolean;
    // For `trackEnd`: how many tracks are to end, and how many still are.
    tracks?: number;
    tracksLeft?: number;
    // For the triggers that wait for tracks to end: how many have since the timer was set.
    tracksEnded?: number;
};

export type TimerState = {
    // What this computer can do, in the order to offer it.
    supportedActions: TimerAction[];
    timer: ActiveTimer | null;
};

export type SetTimerRequest = {
    actions: TimerAction[];
    trigger: TimerTrigger;
    seconds?: number;
    at?: number;
    waitTrackEnd?: boolean;
    tracks?: number;
};

export type FileType = 'audio' | 'playlist';

export type FileRoot = {
    path: string;
    // The volume label; empty when it has none.
    label: string;
};

export type FolderEntry = {
    name: string;
    path: string;
};

export type FileEntry = {
    name: string;
    path: string;
    type: FileType;
    size: number;
};

export type FilesSortBy = 'name' | 'modified';

export const filesSortModes: readonly FilesSortBy[] = ['name', 'modified'];

// The order a folder is listed in, applied by the server.
export type FilesSort = {
    by: FilesSortBy;
    descending: boolean;
};

// The roots of the computer's file system, or one folder of it.
export type FolderListing =
    | { roots: FileRoot[]; parent?: undefined; folders?: undefined; files?: undefined }
    | { roots?: undefined; parent: string; folders: FolderEntry[]; files: FileEntry[] };

// Extensions, lower-case and without the dot.
export type FileFormats = {
    audio: string[];
    playlists: string[];
};

// Paths of files, folders and playlist files on the player's computer, and URLs.
export type AddItemsRequest = {
    playlistId: string;
    files?: string[];
    urls?: string[];
};

export type EqualizerBand = {
    frequency: number; // Hz
    gain: number; // dB, -15..15
};

export type EqualizerState = {
    active: boolean;
    // The player picks a preset by the track's genre.
    auto: boolean;
    preamp: number; // dB, -15..15
    // The preset whose gains the bands hold; none for a custom curve.
    preset: string | null;
    bands: EqualizerBand[];
};

// The sound effects besides the equalizer, by the SDK's names.
export type SoundEffect =
    'echo' | 'reverb' | 'flanger' | 'chorus' | 'trueBass' | 'enhancer' | 'speed' | 'tempo' | 'pitch';

// The player's sound, in its own ranges.
export type EffectsState = Record<SoundEffect, number> & {
    // Grows with every change: the greater one is the newer state.
    revision: number;
    balance: number; // -1..1
    equalizer: EqualizerState;
};

export type EqualizerPatch = {
    active?: boolean;
    auto?: boolean;
    preamp?: number;
    // Only the bands to change.
    bands?: { index: number; gain: number }[];
};

export type EffectsPatch = Partial<Record<SoundEffect | 'balance', number>> & {
    equalizer?: EqualizerPatch;
};

export type EqualizerPreset = {
    name: string;
};

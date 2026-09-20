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
    grouping: PlaylistGrouping;
};

export type PlaylistItem = {
    index: number;
    displayText: string;
    secondLine: string;
    duration: number;
    rating: number;
    enabled: boolean;
    isUrl: boolean;
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

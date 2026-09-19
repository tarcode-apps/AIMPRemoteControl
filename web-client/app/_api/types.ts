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

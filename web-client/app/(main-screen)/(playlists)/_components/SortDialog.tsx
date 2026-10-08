'use client';

import { useSortPlaylist } from '@/app/_api/playlists';
import { sortModes, type Playlist } from '@/app/_api/types';
import { SortDialog, type SortChoice } from '@/app/_components/dialogs';

export type PlaylistSortDialogProps = {
    playlist: Playlist;
    open: boolean;
    onClose(): void;
};

export function PlaylistSortDialog({ playlist, open, onClose }: PlaylistSortDialogProps) {
    const sort = useSortPlaylist(playlist.id);
    const submit = (choice: SortChoice) =>
        sort.mutate({ ...choice, revision: playlist.revision }, { onSuccess: onClose });
    // The next opening starts without the last attempt's error.
    const close = () => {
        sort.reset();
        onClose();
    };

    return (
        <SortDialog
            open={open}
            onClose={close}
            modes={sortModes}
            onSubmit={submit}
            pending={sort.isPending}
            error={sort.error}
        />
    );
}

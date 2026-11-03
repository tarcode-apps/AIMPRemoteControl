import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import { expect, test } from '../fixtures';

const encode = encodeURIComponent;

// Keeps a file open without delete sharing, as a program playing it would.
async function holdOpen(file: string): Promise<ChildProcess> {
    const holder = spawn(
        'powershell',
        [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `$f=[IO.File]::Open('${file}','Open','Read','None'); Start-Sleep 120`,
        ],
        { stdio: 'ignore' },
    );
    // Held without sharing, the file cannot be opened even for reading.
    const isHeld = () => {
        try {
            fs.closeSync(fs.openSync(file, 'r'));
            return false;
        } catch {
            return true;
        }
    };
    await expect.poll(isHeld, { message: 'the file is held open' }).toBe(true);
    return holder;
}

test.describe('removing items', () => {
    test('takes the chosen items out in one pass', async ({ api, events, playlists }) => {
        const playlist = await playlists.create({ tracks: 5 });
        const route = `/playlists/${encode(playlist.id)}/items/remove`;
        const before = (await api.playlist(playlist.id))!.revision;
        const announced = events.next<{ playlists: { id: string; revision: number }[] }>('playlists', data =>
            data.playlists.some(p => p.id === playlist.id && p.revision > before),
        );

        expect((await api.post(route, { indexes: [3, 1] })).status).toBe(200);
        await announced;
        const left = (await api.items(playlist.id)).items.map(item => item.fileUri);
        expect(left).toEqual([playlist.files[0], playlist.files[2], playlist.files[4]]);
        // The files stay on disk.
        for (const file of playlist.files) expect(fs.existsSync(file)).toBe(true);
    });

    test('takes out what a search selects, but the exceptions', async ({ api, playlists }) => {
        const playlist = await playlists.create({
            tracks: [{ title: 'Drop one' }, { title: 'Keep' }, { title: 'Drop two' }, { title: 'Drop three' }],
        });
        const route = `/playlists/${encode(playlist.id)}/items/remove`;
        expect((await api.post(route, { search: 'drop', except: [2] })).status).toBe(200);
        await expect
            .poll(async () => (await api.items(playlist.id)).items.map(item => item.fileUri))
            .toEqual([playlist.files[1], playlist.files[2]]);
    });

    test('refuses a bad selection and a stale revision', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: 2 });
        const route = `/playlists/${encode(playlist.id)}/items/remove`;
        expect((await api.post(route, {})).error?.code).toBe('invalidBody');
        expect((await api.post(route, { indexes: [] })).error?.code).toBe('invalidBody');
        expect((await api.post(route, { indexes: [0], except: [1] })).error?.code).toBe('invalidBody');
        expect((await api.post(route, { indexes: [7] })).error?.code).toBe('itemNotFound');
        const revision = (await api.playlist(playlist.id))!.revision;
        expect((await api.post(route, { indexes: [0], revision: revision + 100 })).error?.code).toBe('playlistChanged');
        expect(await api.playlistItemCount(playlist.id)).toBe(2);
    });

    // The player deletes into the Recycle Bin, where the generated files end up.
    test('deletes the files from disk when asked', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: 3 });
        const route = `/playlists/${encode(playlist.id)}/items/remove`;
        expect((await api.post(route, { indexes: [0, 2], physically: true })).status).toBe(200);
        await expect.poll(() => api.playlistItemCount(playlist.id)).toBe(1);
        await expect.poll(() => fs.existsSync(playlist.files[0])).toBe(false);
        expect(fs.existsSync(playlist.files[2])).toBe(false);
        expect(fs.existsSync(playlist.files[1])).toBe(true);
    });

    test('refuses to delete a part of a container file, and removes nothing', async ({ api, media, playlists }) => {
        const sheet = media.cue(['Part one', 'Part two']);
        const playlist = await playlists.create({ tracks: 1, files: [sheet], expectItems: 3 });
        const items = (await api.items(playlist.id)).items;
        const part = items.find(item => item.inContainer);
        expect(part, 'a CUE part is listed as inside a container').toBeDefined();

        const route = `/playlists/${encode(playlist.id)}/items/remove`;
        const refused = await api.post(route, { indexes: [0, part!.index], physically: true });
        expect(refused.status).toBe(400);
        expect(refused.error?.code).toBe('itemInContainer');
        expect(await api.playlistItemCount(playlist.id)).toBe(3);
        expect(fs.existsSync(playlist.files[0])).toBe(true);

        // Out of the playlist alone, a part goes like any item.
        expect((await api.post(route, { indexes: [part!.index] })).status).toBe(200);
        await expect.poll(() => api.playlistItemCount(playlist.id)).toBe(2);
    });

    test('refuses to delete a file held by another program, naming it', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: 2 });
        const holder = await holdOpen(playlist.files[0]);
        try {
            const route = `/playlists/${encode(playlist.id)}/items/remove`;
            const refused = await api.post(route, { indexes: [0, 1], physically: true });
            expect(refused.status).toBe(403);
            expect(refused.error?.code).toBe('filesNotDeletable');
            expect(refused.error?.files).toEqual([playlist.files[0]]);
            expect(await api.playlistItemCount(playlist.id)).toBe(2);
            expect(fs.existsSync(playlist.files[1])).toBe(true);

            // Out of the playlist alone, a held file goes like any item.
            expect((await api.post(route, { indexes: [0] })).status).toBe(200);
            await expect.poll(() => api.playlistItemCount(playlist.id)).toBe(1);
        } finally {
            holder.kill();
        }
    });
});

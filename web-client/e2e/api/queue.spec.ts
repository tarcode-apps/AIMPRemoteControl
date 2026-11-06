import type { Queue } from '@/app/_api/types';
import { expect, test } from '../fixtures';

const unknownId = '{00000000-0000-0000-0000-000000000000}';

test.describe('queue', () => {
    test('queues items at the end, at the beginning and more than once', async ({ api, events, playlists }) => {
        const playlist = await playlists.create({ tracks: 4 });
        const announced = events.next<{ count: number }>('queue', data => data.count === 2);
        expect((await api.post('/queue/items', { playlistId: playlist.id, indexes: [2, 1] })).status).toBe(200);
        await announced;
        // In playlist order, whatever the order asked.
        expect((await api.queue()).items.map(item => item.index)).toEqual([1, 2]);

        await api.enqueue(playlist.id, [3], true);
        await api.enqueue(playlist.id, [1]);
        const queue = await api.queue();
        expect(queue.items.map(item => [item.position, item.index])).toEqual([
            [0, 3],
            [1, 1],
            [2, 2],
            [3, 1],
        ]);
        expect(queue.items[0]).toMatchObject({ playlistId: playlist.id, fileUri: playlist.files[3] });
        expect(queue.suspended).toBe(false);
    });

    test('queues what a search selects, by groups and with exceptions', async ({ api, playlists }) => {
        const playlist = await playlists.create({
            tracks: [
                { title: 'Pick one', folder: 'A' },
                { title: 'Other', folder: 'A' },
                { title: 'Pick two', folder: 'B' },
                { title: 'Pick three', folder: 'B' },
            ],
        });
        expect((await api.post('/queue/items', { playlistId: playlist.id, search: 'pick', except: [3] })).status).toBe(
            200,
        );
        expect((await api.queue()).items.map(item => item.index)).toEqual([0, 2]);
        await api.clearQueue();

        expect(
            (await api.post('/queue/items', { playlistId: playlist.id, search: '', groups: [1], indexes: [1] })).status,
        ).toBe(200);
        expect((await api.queue()).items.map(item => item.index)).toEqual([1, 2, 3]);
    });

    test('takes out and moves entries by position', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: 3 });
        await api.enqueue(playlist.id, [0, 1, 2]);
        await api.enqueue(playlist.id, [0]);
        let queue = await api.queue();

        expect((await api.post('/queue/remove', { positions: [0], revision: queue.revision })).status).toBe(200);
        queue = await api.queue();
        // The other entry of the same track stays.
        expect(queue.items.map(item => item.index)).toEqual([1, 2, 0]);

        expect((await api.post('/queue/move', { positions: [2], target: 0, revision: queue.revision })).status).toBe(
            200,
        );
        expect((await api.queue()).items.map(item => item.index)).toEqual([0, 1, 2]);
    });

    test('empties, suspends and resumes', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: 2 });
        await api.enqueue(playlist.id, [0, 1]);
        expect((await api.patch('/queue', { suspended: true })).status).toBe(200);
        expect((await api.queue()).suspended).toBe(true);
        expect((await api.patch('/queue', { suspended: false })).status).toBe(200);
        expect((await api.queue()).suspended).toBe(false);
        const { revision } = await api.queue();
        expect((await api.delete('/queue', { revision })).status).toBe(200);
        expect((await api.queue()).items).toEqual([]);
    });

    test('stays as it was over a track switch that takes nothing out of it', async ({ api, events, playlists }) => {
        const playlist = await playlists.create({ tracks: [{ seconds: 20 }, { seconds: 20 }, { seconds: 20 }] });
        await api.play(playlist.id, 0);
        await expect.poll(async () => (await api.player()).track?.index).toBe(0);
        const { revision } = await api.queue();
        const since = events.mark();
        await api.command('next');
        await expect.poll(async () => (await api.player()).track?.index).toBe(1);
        // The player notifies the queue's listeners a moment after the switch.
        await expect(events.next('queue', () => true, { since, timeout: 2000 })).rejects.toThrow();
        expect((await api.queue()).revision).toBe(revision);

        // One the player takes out of the queue is a change.
        await api.enqueue(playlist.id, [0]);
        const taken = events.next<{ count: number }>('queue', data => data.count === 0);
        await api.command('next');
        await taken;
        await expect.poll(async () => (await api.player()).track?.index).toBe(0);
    });

    test('counts its changes and refuses stale or bad requests', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: 2 });
        const before = (await api.queue()).revision;
        await api.enqueue(playlist.id, [0, 1]);
        const { revision } = await api.queue();
        expect(revision).toBeGreaterThan(before);

        expect((await api.post('/queue/remove', { positions: [0], revision: revision + 100 })).error?.code).toBe(
            'queueChanged',
        );
        expect(
            (await api.post('/queue/move', { positions: [1], target: 0, revision: revision + 100 })).error?.code,
        ).toBe('queueChanged');
        expect((await api.delete('/queue', { revision: revision + 100 })).error?.code).toBe('queueChanged');
        expect((await api.post('/queue/remove', { positions: [5] })).error?.code).toBe('itemNotFound');
        expect((await api.post('/queue/remove', {})).error?.code).toBe('invalidBody');
        expect((await api.post('/queue/items', { playlistId: playlist.id, indexes: [9] })).error?.code).toBe(
            'itemNotFound',
        );
        expect((await api.post('/queue/items', { playlistId: playlist.id, except: [0] })).error?.code).toBe(
            'invalidBody',
        );
        expect((await api.post('/queue/items', { playlistId: unknownId, indexes: [0] })).error?.code).toBe(
            'playlistNotFound',
        );
        expect((await api.patch('/queue', { suspended: 'yes' })).error?.code).toBe('invalidBody');
        expect(((await api.get<Queue>('/queue')).body as Queue).items).toHaveLength(2);
    });
});

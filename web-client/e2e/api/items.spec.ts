import type { ItemDetailsResponse, ItemsSummary } from '@/app/_api/types';
import { expect, test } from '../fixtures';

// A selection over several playlists, as every request about items takes it.
test.describe('items of several playlists', () => {
    test('sums up the ranges of a search over several playlists, and a whole playlist', async ({ api, playlists }) => {
        // The search looks at the folder's name too, which is the test's: a word of
        // its own.
        const first = await playlists.create({
            tracks: [
                { title: 'Zeta one', seconds: 10 },
                { title: 'Other', seconds: 20 },
                { title: 'Zeta two', seconds: 40 },
            ],
        });
        const second = await playlists.create({ tracks: [{ title: 'Zeta three', seconds: 80 }] });
        const summary = await api.post<ItemsSummary>('/items/summary', {
            search: 'zeta',
            playlists: [
                { playlistId: first.id, ranges: [[0, 1]] },
                { playlistId: second.id, ranges: [[0, 0]] },
            ],
        });
        expect(summary.status).toBe(200);
        expect(summary.body!.count).toBe(3);
        expect(summary.body!.duration).toBeCloseTo(130, 0);
        expect(summary.body!.size).toBeGreaterThan(0);

        const whole = await api.post<ItemsSummary>('/items/summary', {
            playlists: [{ playlistId: first.id, ranges: [[0, 2]] }],
        });
        expect(whole.body!.count).toBe(3);
        expect(whole.body!.duration).toBeCloseTo(70, 0);
    });

    test('details the playlists in their order, each item with its playlist', async ({ api, playlists }) => {
        const first = await playlists.create({ tracks: [{ title: 'A one' }, { title: 'A two' }] });
        const second = await playlists.create({ tracks: [{ title: 'B one' }] });
        const details = await api.post<ItemDetailsResponse>('/items/details', {
            playlists: [
                { playlistId: second.id, indexes: [0] },
                { playlistId: first.id, ranges: [[1, 1]] },
            ],
        });
        expect(details.status).toBe(200);
        expect(details.body!.items.map(item => [item.playlistId, item.index])).toEqual([
            [second.id, 0],
            [first.id, 1],
        ]);
    });

    test('names the playlist that fails, and does nothing then', async ({ api, playlists }) => {
        const first = await playlists.create({ tracks: 2 });
        const second = await playlists.create({ tracks: 2 });
        const enabled = async (id: string) => (await api.items(id)).items.map(item => item.enabled);

        const refused = await api.post('/items/enabled', {
            playlists: [
                { playlistId: first.id, indexes: [0] },
                { playlistId: second.id, ranges: [[0, 5]] },
            ],
            enabled: false,
        });
        expect(refused.error?.code).toBe('itemNotFound');
        expect(refused.error?.playlistId).toBe(second.id);
        expect(await enabled(first.id)).toEqual([true, true]);

        expect(
            (
                await api.post('/items/enabled', {
                    playlists: [
                        { playlistId: first.id, indexes: [0] },
                        { playlistId: second.id, ranges: [[1, 1]] },
                    ],
                    enabled: false,
                })
            ).status,
        ).toBe(200);
        await expect.poll(() => enabled(first.id)).toEqual([false, true]);
        await expect.poll(() => enabled(second.id)).toEqual([true, false]);
    });
});

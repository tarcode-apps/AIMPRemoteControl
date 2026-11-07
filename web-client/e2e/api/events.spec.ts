import { expect, test } from '../fixtures';
import { EventStream } from '../lib/events';

type PlaylistsEvent = { playlists: { id: string; revision: number }[] };

test.describe('events', () => {
    test('greet a new stream with the plugin version', async ({ playerUrl }) => {
        // Aborted rather than cancelled: a cancelled body leaves Node's connection
        // open, and the stream holds its place on the server.
        const controller = new AbortController();
        const response = await fetch(`${playerUrl}/api/v1/events`, { signal: controller.signal });
        expect(response.headers.get('content-type')).toContain('text/event-stream');
        const reader = response.body!.getReader();
        let text = '';
        // The hello may come in a chunk of its own, after the retry hint.
        while (!text.includes('event: hello') || !text.includes('\n\n', text.indexOf('event: hello'))) {
            const { value, done } = await reader.read();
            if (done) break;
            text += new TextDecoder().decode(value);
        }
        controller.abort();
        expect(text).toMatch(/^retry: 3000/);
        expect(text).toMatch(/event: hello\ndata: \{"pluginVersion":"\d+\.\d+\.\d+\.\d+"\}/);
    });

    test('list every playlist with its revision when one is added or removed', async ({ api, events }) => {
        const since = events.mark();
        const id = await api.createPlaylist('rc-e2e event');
        const withIt = await events.next<PlaylistsEvent>('playlists', data => data.playlists.some(p => p.id === id), {
            since,
        });
        expect(withIt.playlists.map(p => p.id).sort()).toEqual((await api.playlists()).map(p => p.id).sort());

        const removed = events.next<PlaylistsEvent>('playlists', data => !data.playlists.some(p => p.id === id));
        await api.deletePlaylist(id);
        await removed;
    });

    test('tell of the queue with its revision and count', async ({ api, events, playlists }) => {
        const playlist = await playlists.create({ tracks: 2 });
        const told = events.next<{ revision: number; count: number; suspended: boolean }>(
            'queue',
            data => data.count === 2,
        );
        await api.enqueue(playlist.id, [0, 1]);
        const queue = await told;
        expect(queue.suspended).toBe(false);
        expect(queue.revision).toBe((await api.queue()).revision);
    });

    test('keep a client to sixteen long requests, and serve the rest meanwhile', async ({ api, playerUrl }) => {
        // Opened until refused: another client on this machine, such as a dev
        // server proxying a browser tab, may hold some of the sixteen already.
        const streams: EventStream[] = [];
        const openOne = () =>
            EventStream.open(playerUrl).then(
                stream => streams.push(stream) > 0,
                () => false,
            );
        try {
            while (streams.length <= 16 && (await openOne()));
            expect(streams.length).toBeGreaterThan(0);
            expect(streams.length).toBeLessThanOrEqual(16);
            const refused = await fetch(`${playerUrl}/api/v1/events`);
            expect(refused.status).toBe(503);
            expect(refused.headers.get('retry-after')).toBe('3');
            expect((await api.rpc('SubscribeOnAIMPStateUpdateEvent', { event: 'queue_content_change' })).error).toEqual(
                expect.objectContaining({ code: -32000, message: 'too many pending requests' }),
            );
            expect((await api.get('/player')).status).toBe(200);

            // A stream that ends gives its place back, once the server notices.
            streams.pop()!.close();
            await expect.poll(openOne).toBe(true);
        } finally {
            for (const stream of streams) stream.close();
        }
    });

    test('reach every open stream', async ({ api, events, playerUrl }) => {
        const second = await EventStream.open(playerUrl);
        try {
            const first = events.next('effects');
            const other = second.next('effects');
            await api.setEffects({ echo: 0.1 });
            await Promise.all([first, other]);
        } finally {
            second.close();
            await api.resetEffects();
        }
    });
});

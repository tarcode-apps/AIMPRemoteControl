import { test as base, expect } from '@playwright/test';
import path from 'node:path';
import {
    defaultPlayerProfile,
    defaultPluginSettings,
    restartThrowawayPlayer,
    type PlayerProfile,
    type PluginSettings,
} from './lib/aimp';
import { Api } from './lib/api';
import { EventStream } from './lib/events';
import { MediaFolder, type TrackOptions } from './lib/media';
import { runtimeDir } from './lib/paths';
import { StreamServer } from './lib/streams';

// Set in playwright.config.ts.
export type Options = {
    // The player the tests talk to.
    playerUrl: string;
};

export type TestPlaylist = {
    id: string;
    name: string;
    files: string[];
};

export type PlaylistOptions = {
    name?: string;
    // Generated tracks: how many, or one set of options per track.
    tracks?: number | TrackOptions[];
    // Files already made, such as a CUE sheet, added after the tracks.
    files?: string[];
    // Streams, added after the files.
    urls?: string[];
    // The item count to wait for when `files` hold containers or folders.
    expectItems?: number;
};

type Fixtures = {
    api: Api;
    // The player's events, open from before the test's first request.
    events: EventStream;
    // Generated files for this test alone.
    media: MediaFolder;
    // Radio stations of the test's own, broadcasting silence.
    streams: StreamServer;
    // Playlists of the test's own, filled with generated tracks; removed afterwards.
    playlists: {
        create(options?: PlaylistOptions): Promise<TestPlaylist>;
        // Removes afterwards the playlists of this name the test makes through the client.
        adopt(name: string): void;
    };
    // Names for the equalizer presets a test creates; every preset so named is
    // removed afterwards.
    presets: {
        name(suffix: string): string;
    };
    // Leaves the player as the next test expects it: stopped, the queue empty and
    // running, no timer, no repeat or shuffle.
    playerReset: void;
};

// How long a new playlist's revision must hold still before a test uses it.
const settleTime = 1000;

const fileName = (text: string) => text.replace(/[^\w.-]+/g, '-').slice(0, 60);

export const test = base.extend<Fixtures, Options>({
    playerUrl: ['http://127.0.0.1:3333', { option: true, scope: 'worker' }],

    api: async ({ playerUrl, playwright }, use) => {
        const context = await playwright.request.newContext({ baseURL: playerUrl });
        await use(new Api(context));
        await context.dispose();
    },

    events: async ({ playerUrl }, use) => {
        const stream = await EventStream.open(playerUrl);
        await use(stream);
        stream.close();
    },

    media: async ({}, use, testInfo) => {
        const media = new MediaFolder(
            path.join(runtimeDir, 'media', `${testInfo.project.name}-${fileName(testInfo.title)}`),
        );
        await use(media);
        // A failed test's files stay for a look; the next run clears them all.
        if (testInfo.status === testInfo.expectedStatus) media.remove();
    },

    streams: async ({}, use) => {
        const streams = new StreamServer();
        await streams.start();
        await use(streams);
        streams.close();
    },

    playlists: async ({ api, media }, use, testInfo) => {
        const created: string[] = [];
        const adopted: string[] = [];
        await use({
            async create({ name = `rc-e2e ${testInfo.title}`, tracks = 0, files = [], urls = [], expectItems } = {}) {
                const id = await api.createPlaylist(name);
                created.push(id);
                const generated =
                    typeof tracks === 'number'
                        ? media.tracks(tracks)
                        : tracks.map((options, i) => media.track(options.title ?? `Track ${i + 1}`, options));
                const all = [...generated, ...files];
                if (all.length || urls.length) {
                    await api.addItems(id, all, urls);
                    const count = expectItems ?? all.length + urls.length;
                    await expect
                        .poll(() => api.playlistItemCount(id), { message: `the player adds ${count} items` })
                        .toBe(count);
                }
                // The player lists a file by its name first and reads its tags a moment later.
                if (generated.length)
                    await expect
                        .poll(
                            async () => {
                                const items = await api.allItems(id);
                                return generated.every(file => {
                                    const item = items.find(i => i.fileUri === file);
                                    return item !== undefined && item.displayText !== path.parse(file).name;
                                });
                            },
                            { message: 'the player reads the tags' },
                        )
                        .toBe(true);
                // It updates the playlist once more about half a second later, with nothing
                // visible changed; a client that loaded it before then would act on a stale
                // revision and be refused.
                if (all.length || urls.length) {
                    let last = { revision: -1, at: 0 };
                    await expect
                        .poll(
                            async () => {
                                const playlist = await api.playlist(id);
                                if (!playlist) throw new Error(`the playlist ${name} is gone`);
                                const { revision } = playlist;
                                if (revision !== last.revision) last = { revision, at: Date.now() };
                                return Date.now() - last.at >= settleTime;
                            },
                            { intervals: [250], message: 'the playlist settles' },
                        )
                        .toBe(true);
                }
                return { id, name, files: all };
            },
            adopt(name) {
                adopted.push(name);
            },
        });
        for (const playlist of await api.playlists())
            if (created.includes(playlist.id) || adopted.includes(playlist.name)) await api.deletePlaylist(playlist.id);
    },

    presets: async ({ api }, use, testInfo) => {
        const prefix = `rc-e2e ${testInfo.testId} `;
        await use({ name: suffix => `${prefix}${suffix}` });
        for (const name of await api.presetNames()) if (name.startsWith(prefix)) await api.removePreset(name);
    },

    // Set up after the media, so that the player has let go of the tracks before
    // they are removed.
    playerReset: [
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- asked for its teardown order alone
        async ({ api, media }, use) => {
            await use();
            // Raw requests: a test may have left the player with a permission off or
            // behind a login.
            await api.post('/player/stop');
            // The track fades out for a moment with its file still open.
            await expect
                .poll(async () => {
                    const { status, body } = await api.get<{ state: string }>('/player');
                    return status !== 200 || body?.state === 'stopped';
                })
                .toBe(true);
            await api.delete('/queue');
            await api.patch('/queue', { suspended: false });
            await api.delete('/timer');
            await api.patch('/player', { repeat: 'off', shuffle: false });
        },
        { auto: true },
    ],

    // The client in English, whatever language the machine speaks.
    page: async ({ page }, use) => {
        await page.addInitScript(() => localStorage.setItem('language', 'en'));
        await use(page);
    },
});

// Runs the tests of the enclosing describe against the throwaway player
// restarted with other settings of the plugin, or of the player itself, and
// restores the usual ones afterwards. A player the tests did not start cannot
// be restarted, so they are skipped.
export function withPluginSettings(settings: Partial<PluginSettings>, profile: Partial<PlayerProfile> = {}) {
    test.describe.configure({ mode: 'serial' });
    test.skip(!!process.env.E2E_PLAYER_URL, 'needs the throwaway player, which E2E_PLAYER_URL replaces');
    test.beforeAll(async ({ playerUrl }) => {
        await restartThrowawayPlayer(
            playerUrl,
            { ...defaultPluginSettings, ...settings },
            { ...defaultPlayerProfile, ...profile },
        );
    });
    test.afterAll(async ({ playerUrl }) => {
        await restartThrowawayPlayer(playerUrl, defaultPluginSettings);
    });
}

export { expect };

import type { Page } from '@playwright/test';
import os from 'node:os';
import { expect, test } from './fixtures';
import { PlaylistScreen } from './pages/playlist-screen';
import { TrackInfoScreen } from './pages/track-info-screen';
import { t } from './strings';

// The Android app shows the client in a web view and gives the page a bridge,
// `window.aimpRemoteControlApp` (docs/android-bridge.md). Here a stand-in takes the
// app's place: it answers the client's greeting with what the app can do and keeps
// what it is told. A request for the API it makes as the app does, by itself, and
// marks as its own. Of events and of the connection it says what a test has it say.
async function standInForApp(page: Page, features: string[]) {
    await page.addInitScript(features => {
        const told: string[] = [];
        const tell = (message: object) => window.aimpRemoteControlApp?.onmessage?.({ data: JSON.stringify(message) });
        // As the app does, not within the client's own call.
        const answer = (message: object) => setTimeout(() => tell(message));

        async function ask(request: { id: number; method: string; path: string; body?: string; file?: boolean }) {
            const response = await fetch(request.path, {
                method: request.method,
                body: request.body,
                headers: { 'X-By-App': '1', ...(request.body !== undefined && { 'Content-Type': 'application/json' }) },
            });
            const { pathname, search } = new URL(response.url);
            const answered = {
                type: 'response',
                id: request.id,
                status: response.status,
                contentType: response.headers.get('Content-Type'),
                url: pathname + search,
            };
            if (!request.file) return { ...answered, body: await response.text() };
            let binary = '';
            for (const byte of new Uint8Array(await response.arrayBuffer())) binary += String.fromCharCode(byte);
            return { ...answered, base64: btoa(binary) };
        }

        Object.assign(window, { toldToApp: told, appTells: tell });
        window.aimpRemoteControlApp = {
            onmessage: null,
            postMessage(text) {
                told.push(text);
                const message = JSON.parse(text);
                if (message.type === 'hello') answer({ type: 'hello', features });
                if (message.type === 'request')
                    ask(message).then(answer, () => answer({ type: 'response', id: message.id, error: 'network' }));
            },
        };
    }, features);
}

type AppWindow = { toldToApp: string[]; appTells(message: object): void };

const toldToApp = (page: Page) => page.evaluate(() => (window as unknown as AppWindow).toldToApp);
const appTells = (page: Page, message: object) =>
    page.evaluate(message => (window as unknown as AppWindow).appTells(message), message);

// The requests for the API that the page made by itself, which in the app has no
// login for them.
function ownRequests(page: Page): string[] {
    const own: string[] = [];
    page.on('request', request => {
        const { pathname } = new URL(request.url());
        // Where the player redirects a request, the mark is that of the request.
        let asked = request;
        for (let from = asked.redirectedFrom(); from; from = asked.redirectedFrom()) asked = from;
        if (pathname.startsWith('/api/') && !asked.headers()['x-by-app']) own.push(`${request.method()} ${pathname}`);
    });
    return own;
}

test.describe('in the Android app', () => {
    test('disconnect from the player', async ({ app, player }) => {
        await standInForApp(app.page, ['disconnect']);
        // A mobile opens on the expanded player.
        await app.goto('/');
        await player.collapse();
        await app.openDrawer();

        // The button is inside the card of the player, which still opens what is known of it.
        const card = app.navigation.getByRole('button').filter({ hasText: os.hostname() });
        const button = app.navigation.getByRole('button', { name: t('nav.disconnect'), exact: true });
        const [cardBox, buttonBox] = [await card.boundingBox(), await button.boundingBox()];
        expect(buttonBox!.x).toBeGreaterThanOrEqual(cardBox!.x + cardBox!.width);
        expect(buttonBox!.y).toBeGreaterThan(cardBox!.y);
        expect(buttonBox!.y + buttonBox!.height).toBeLessThan(cardBox!.y + cardBox!.height);

        await button.click();
        await expect.poll(() => toldToApp(app.page)).toEqual(['{"type":"hello"}', '{"type":"disconnect"}']);
        await expect(app.dialog).toBeHidden();

        await card.click();
        await expect(app.dialog.getByRole('heading')).toHaveText(os.hostname());
    });

    test('ask an older app for nothing it does not name', async ({ app, player }) => {
        await standInForApp(app.page, []);
        await app.goto('/');
        // The greeting waits for nothing on the screen: the app tells the client by it.
        await expect.poll(() => toldToApp(app.page)).toEqual(['{"type":"hello"}']);

        // The player is reached as a browser reaches it.
        await player.collapse();
        await app.openDrawer();
        await expect(app.navigation.getByRole('button').filter({ hasText: os.hostname() })).toBeVisible();
        await expect(app.navigation.getByRole('button', { name: t('nav.disconnect'), exact: true })).toBeHidden();
        expect(await toldToApp(app.page)).toEqual(['{"type":"hello"}']);
    });

    test('offer no disconnecting in a browser', async ({ app, player }) => {
        await app.goto('/');
        await player.collapse();
        await app.openDrawer();

        await expect(app.navigation.getByRole('button').filter({ hasText: os.hostname() })).toBeVisible();
        await expect(app.navigation.getByRole('button', { name: t('nav.disconnect'), exact: true })).toBeHidden();
    });

    test('reach the player through the app, images and commands too', async ({ api, app, media, page, playlists }) => {
        const own = ownRequests(page);
        // The folder's image, which the player takes as the tracks' cover.
        media.cover();
        const playlist = await playlists.create({ tracks: [{ title: 'Through', seconds: 60 }, { title: 'Next' }] });
        await standInForApp(page, ['api']);
        const screen = new PlaylistScreen(app, playlist.name);
        await screen.open();
        await expect(screen.row('Through')).toBeVisible();

        // A command.
        await screen.play('Through');
        await expect.poll(async () => (await api.player()).track?.title).toBe('Through');

        // The page has no login to save a file with, and the app saves none yet.
        await screen
            .row('Next')
            .getByRole('button', { name: t('playlist.itemActions') })
            .click();
        await expect(page.getByRole('menuitem').last()).toHaveAccessibleName(t('playlist.deleteFromDisk'));
        await page.keyboard.press('Escape');

        // The image as it is in the file comes through the app as well.
        const info = new TrackInfoScreen(app);
        await screen.rowAction('Next', t('trackInfo.open'));
        await info.viewCover();
        const image = info.viewer.getByRole('img');
        expect(await image.evaluate((image: HTMLImageElement) => image.currentSrc)).toMatch(/^blob:/);
        expect(await image.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(300);

        expect(await toldToApp(page)).toContain('{"type":"events","listen":true}');
        expect(own).toEqual([]);
    });

    test('hear of the player and of the connection from the app', async ({ app, page, player }) => {
        const own = ownRequests(page);
        await standInForApp(page, ['api']);
        await app.goto('/');
        await expect.poll(() => toldToApp(page)).toContain('{"type":"events","listen":true}');
        const connection = { type: 'connection', online: true, checking: false, closed: false, retryAt: null };
        await appTells(page, connection);
        await appTells(page, { type: 'open' });

        // The loss, and the wait for the next attempt, are the app's to tell.
        const banner = page.getByTestId('connection-banner');
        await expect(banner).toBeHidden();
        await appTells(page, { ...connection, online: false, retryAt: Date.now() + 30_000 });
        await expect(banner.getByRole('status')).toHaveText(t('connection.lost'));
        await banner.getByRole('button', { name: t('connection.retry') }).click();
        await expect.poll(() => toldToApp(page)).toContain('{"type":"retry"}');
        await appTells(page, connection);
        await appTells(page, { type: 'open' });
        await expect(banner).toBeHidden();

        // An event of the player's stream, which the app keeps.
        const about = { name: 'Told by the app', aimpVersion: 'v1', pluginVersion: '1', features: {} };
        await appTells(page, { type: 'event', name: 'hello', data: JSON.stringify(about) });
        await player.collapse();
        await app.openDrawer();
        await expect(app.navigation.getByRole('button').filter({ hasText: about.name })).toBeVisible();
        expect(own).toEqual([]);
    });
});

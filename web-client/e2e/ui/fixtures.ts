import { test as base } from '../fixtures';
import { App } from './pages/app';
import { PlayerPanel } from './pages/player-panel';

// The page objects every UI test starts from.
export const test = base.extend<{ app: App; player: PlayerPanel; clientErrors: void }>({
    app: async ({ page, hasTouch }, use) => {
        await use(new App(page, hasTouch));
    },
    player: async ({ app }, use) => {
        await use(new PlayerPanel(app));
    },
    // The client's requests the player refused, attached to the report: a refused
    // request often leaves no trace on the screen. A track without art answers 404.
    clientErrors: [
        async ({ page }, use, testInfo) => {
            const errors: string[] = [];
            page.on('response', async response => {
                if (!response.url().includes('/api/') || response.ok()) return;
                if (response.status() === 404 && new URL(response.url()).pathname.endsWith('/cover')) return;
                const request = response.request();
                errors.push(
                    `${request.method()} ${response.url()} ${request.postData() ?? ''}\n` +
                        `  → ${response.status()} ${await response.text().catch(() => '')}`,
                );
            });
            await use();
            if (errors.length)
                await testInfo.attach('client-api-errors', { body: errors.join('\n'), contentType: 'text/plain' });
        },
        { auto: true },
    ],
});

export { expect, withPluginSettings } from '../fixtures';

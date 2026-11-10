import { defineConfig } from '@playwright/test';
import path from 'node:path';
import type { Options } from './fixtures';
import { defaultPlayerUrl } from './lib/aimp';
import { runtimeDir } from './lib/paths';

// Without E2E_PLAYER_URL, global-setup starts a throwaway copy of the installed
// AIMP with a clean profile and the built plugin. With it, the tests use the
// player already running there, which must have every permission of the plugin
// on and no authentication.
const playerUrl = process.env.E2E_PLAYER_URL ?? defaultPlayerUrl;

// The web client under test: the one the plugin serves from
// plugin/dist/windows-x64/wwwroot (built with `npm run build`), or a dev server such as
// http://localhost:3334.
const clientUrl = process.env.E2E_CLIENT_URL ?? playerUrl;

const ui = { testMatch: 'ui/**/*.spec.ts', use: { baseURL: clientUrl, channel: 'chrome' } };

export default defineConfig<object, Options>({
    testDir: __dirname,
    outputDir: path.join(runtimeDir, 'test-results'),
    globalSetup: './global-setup',
    globalTeardown: './global-teardown',
    // One player, so one test at a time.
    workers: 1,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    timeout: 60_000,
    expect: { timeout: 10_000 },
    reporter: [['list'], ['html', { outputFolder: path.join(runtimeDir, 'report'), open: 'never' }]],
    use: {
        playerUrl,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        actionTimeout: 10_000,
    },
    projects: [
        { name: 'api', testMatch: 'api/**/*.spec.ts' },
        {
            name: 'ui-mobile',
            ...ui,
            use: { ...ui.use, viewport: { width: 400, height: 800 }, isMobile: true, hasTouch: true },
        },
        { name: 'ui-desktop', ...ui, use: { ...ui.use, viewport: { width: 1400, height: 900 } } },
        { name: 'ui-desktop-wide', ...ui, use: { ...ui.use, viewport: { width: 1920, height: 1080 } } },
    ],
});

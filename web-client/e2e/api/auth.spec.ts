import type { APIRequestContext, APIResponse } from '@playwright/test';
import { expect, test, withPluginSettings } from '../fixtures';
import { authRealm } from '../lib/aimp';
import { authorization, parseChallenge, type Challenge } from '../lib/digest';
import { statusForHeaders } from '../lib/http';

const credentials = { username: 'rc-e2e', password: 'secret word' };
// Longer than the one verification per second the server allows a client
// address after failed credentials.
const failedAttemptPause = 1100;

const challengeOf = (response: APIResponse) => parseChallenge(response.headers()['www-authenticate'] ?? null);

// A request signed for a fresh challenge, as a browser sends it after the 401.
async function signed(
    context: APIRequestContext,
    method: 'GET' | 'POST',
    uri: string,
    {
        data,
        username = credentials.username,
        password = credentials.password,
        nonce,
        signedUri = uri,
    }: {
        data?: unknown;
        username?: string;
        password?: string;
        nonce?: (challenge: Challenge) => string;
        signedUri?: string;
    } = {},
): Promise<APIResponse> {
    const challenge = challengeOf(await context.fetch(uri, { method }))!;
    if (nonce) challenge.nonce = nonce(challenge);
    const header = authorization(challenge, { username, password, method, uri: signedUri });
    return context.fetch(uri, { method, data, headers: { Authorization: header } });
}

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test.describe('with authentication', () => {
    withPluginSettings({ auth: credentials });

    test('the API asks for Digest credentials', async ({ api }) => {
        const response = await api.context.get('/api/v1/player');
        expect(response.status()).toBe(401);
        const challenge = challengeOf(response);
        expect(challenge).toMatchObject({ realm: authRealm, qop: 'auth', algorithm: 'MD5', stale: false });
        expect(challenge!.nonce).toMatch(/^\d+:[0-9a-f]{32}$/);

        expect(
            (await api.context.post('/RPC_JSON', { data: { jsonrpc: '2.0', id: 1, method: 'Version' } })).status(),
        ).toBe(401);
        expect((await api.context.get('/api/v1/events', { timeout: 5000 })).status()).toBe(401);
    });

    test('right credentials pass, a query string included', async ({ api }) => {
        const player = await signed(api.context, 'GET', '/api/v1/player');
        expect(player.status()).toBe(200);
        expect(await player.json()).toHaveProperty('state');

        expect((await signed(api.context, 'GET', '/api/v1/files?path=C%3A%5C')).status()).toBe(200);

        const rpc = await signed(api.context, 'POST', '/RPC_JSON', {
            data: { jsonrpc: '2.0', id: 1, method: 'Version' },
        });
        expect(rpc.status()).toBe(200);
        expect((await rpc.json()).result.plugin_version).toBe('1.2.0.5');
    });

    // Android's DownloadManager signs the absolute URL.
    test('a URI signed with scheme and host passes', async ({ api, playerUrl }) => {
        const response = await signed(api.context, 'GET', '/api/v1/player', {
            signedUri: `${playerUrl}/api/v1/player`,
        });
        expect(response.status()).toBe(200);
    });

    test('the web client and misses are public', async ({ api }) => {
        expect((await api.context.get('/')).status()).toBe(200);
        expect((await api.context.get('/timer/')).status()).toBe(200);
        const miss = await api.context.get('/apple-touch-icon.png');
        expect(miss.status()).toBe(404);
        expect(miss.headers()['www-authenticate']).toBeUndefined();
    });

    // So that an unauthorized client learns nothing of the limits.
    test('an oversized body is refused for the credentials first', async ({ playerUrl }) => {
        const headers = { 'Content-Type': 'application/json', 'Content-Length': 17 * 1024 * 1024 };
        expect(await statusForHeaders(playerUrl, '/RPC_JSON', headers)).toBe(401);
        expect(await statusForHeaders(playerUrl, '/uploadTrack/playlist_id/1', headers)).toBe(401);
    });

    test('wrong credentials, a forged nonce and another URI are refused', async ({ api }) => {
        expect((await signed(api.context, 'GET', '/api/v1/player', { password: 'wrong' })).status()).toBe(401);
        await pause(failedAttemptPause);
        expect((await signed(api.context, 'GET', '/api/v1/player', { username: 'someone' })).status()).toBe(401);
        await pause(failedAttemptPause);
        const forged = await signed(api.context, 'GET', '/api/v1/player', {
            nonce: challenge => `${Number(challenge.nonce.split(':')[0]) + 3600}:${'0'.repeat(32)}`,
        });
        expect(forged.status()).toBe(401);
        await pause(failedAttemptPause);
        expect((await signed(api.context, 'GET', '/api/v1/player', { signedUri: '/api/v1/queue' })).status()).toBe(401);
        await pause(failedAttemptPause);
    });

    test('after a failure, the next second re-challenges even right credentials', async ({ api }) => {
        expect((await signed(api.context, 'GET', '/api/v1/player', { password: 'wrong' })).status()).toBe(401);
        expect((await signed(api.context, 'GET', '/api/v1/player')).status()).toBe(401);
        await pause(failedAttemptPause);
        expect((await signed(api.context, 'GET', '/api/v1/player')).status()).toBe(200);
    });
});

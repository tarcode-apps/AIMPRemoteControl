import dgram from 'node:dgram';
import os from 'node:os';
import { expect, test, withPluginSettings } from '../fixtures';

const discoveryPort = 3332;

// What the player answers to a datagram at its discovery port, as the app
// finds players on the network.
async function discover(playerUrl: string): Promise<string> {
    const host = new URL(playerUrl).hostname;
    const socket = dgram.createSocket('udp4');
    try {
        return await new Promise<string>((resolve, reject) => {
            socket.once('message', message => resolve(message.toString('utf8')));
            socket.once('error', reject);
            socket.send(Buffer.alloc(0), discoveryPort, host, error => error && reject(error));
        });
    } finally {
        socket.close();
    }
}

test.describe('discovery', () => {
    test("answer a datagram with the computer's name", async ({ playerUrl }) => {
        expect(await discover(playerUrl)).toBe(os.hostname());
    });
});

test.describe('discovery of a named player', () => {
    withPluginSettings({ playerName: 'rc-e2e player' });

    test('answer with the name from the plugin settings', async ({ playerUrl }) => {
        expect(await discover(playerUrl)).toBe('rc-e2e player');
    });
});

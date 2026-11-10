import { stopThrowawayPlayer } from './lib/aimp';

export default async function globalTeardown() {
    if (!process.env.E2E_PLAYER_URL) await stopThrowawayPlayer();
}

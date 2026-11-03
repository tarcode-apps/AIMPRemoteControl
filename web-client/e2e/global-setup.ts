import fs from 'node:fs';
import path from 'node:path';
import { defaultPlayerUrl, launchThrowawayPlayer, uploadDir } from './lib/aimp';
import { runtimeDir } from './lib/paths';

export default async function globalSetup() {
    if (process.env.E2E_PLAYER_URL) {
        console.log(`e2e: using the player at ${process.env.E2E_PLAYER_URL}`);
        return;
    }
    const dir = await launchThrowawayPlayer(defaultPlayerUrl);
    // The last run's files go only now: a player holds the files it played.
    for (const leftover of [path.join(runtimeDir, 'media'), uploadDir])
        for (const entry of fs.existsSync(leftover) ? fs.readdirSync(leftover) : [])
            fs.rmSync(path.join(leftover, entry), { recursive: true, force: true });
    console.log(`e2e: started a throwaway AIMP in ${dir}`);
}

import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pluginDistDir, runtimeDir } from './paths';

// The plugin listens on this port and nothing else, so the throwaway player
// takes it; that is why no other AIMP may run meanwhile.
export const defaultPlayerUrl = 'http://127.0.0.1:3333';
const defaultInstallDir = 'C:\\Program Files\\AIMP';
const playerDir = path.join(runtimeDir, 'aimp');
const profileIniPath = path.join(playerDir, 'Profile', 'AIMP.ini');
const pluginLink = path.join(playerDir, 'Plugins', 'aimp_remote_control');
const pidFile = path.join(runtimeDir, 'aimp.pid');
// Where the plugin saves uploaded tracks during a run.
export const uploadDir = path.join(runtimeDir, 'uploads');
const startTimeout = 30_000;
const stopTimeout = 15_000;

// As the player's options page sets them.
export type PluginSettings = {
    // Empty for the computer's name.
    playerName: string;
    physicalDeletion: boolean;
    downloadTracks: boolean;
    uploadTracks: boolean;
    scheduler: boolean;
    browseFiles: boolean;
    // Digest credentials the player asks for; none for an open player.
    auth: { username: string; password: string } | null;
};

// What the tests count on: every permission on and no authentication.
export const defaultPluginSettings: PluginSettings = {
    playerName: '',
    physicalDeletion: true,
    downloadTracks: true,
    uploadTracks: true,
    scheduler: true,
    browseFiles: true,
    auth: null,
};

// Settings of the player itself that the tests seed.
export type PlayerProfile = {
    // The switch column of the playlists; the player honours the switches only
    // while it is shown.
    switchesColumn: boolean;
};

export const defaultPlayerProfile: PlayerProfile = { switchesColumn: true };

// `[Playlist.Manager] Flags` is a bit set of the view settings new playlists
// take; the player writes every bit on when the profile has none.
const switchesColumnFlag = 16;
const defaultPlaylistFlags = 2047;

export const authRealm = 'AIMP Remote Control';

const md5 = (text: string) => crypto.createHash('md5').update(text).digest('hex');
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function isAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function savedPid(): number | undefined {
    if (!fs.existsSync(pidFile)) return undefined;
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    return Number.isInteger(pid) && isAlive(pid) ? pid : undefined;
}

// Every AIMP.exe running on this machine; none when the list cannot be read,
// which the start then tells apart by the throwaway exiting at once.
export function runningPlayerPids(): number[] {
    let output: string;
    try {
        output = execFileSync('tasklist', ['/FI', 'IMAGENAME eq AIMP.exe', '/FO', 'CSV', '/NH'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    } catch (error) {
        console.warn(`e2e: tasklist failed, cannot tell whether AIMP runs: ${(error as Error).message}`);
        return [];
    }
    return [...output.matchAll(/^"AIMP\.exe","(\d+)"/gm)].map(match => Number(match[1]));
}

// The profile is UTF-16LE with a BOM and CRLF, as the player writes it.
function readProfile(): string[] {
    if (!fs.existsSync(profileIniPath)) return [];
    return fs.readFileSync(profileIniPath).subarray(2).toString('utf16le').split('\r\n');
}

function writeProfile(lines: string[]) {
    fs.writeFileSync(
        profileIniPath,
        Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(lines.join('\r\n'), 'utf16le')]),
    );
}

// Replaces the keys of one section of the profile, adding the section when it
// is not there; other sections stay as the player wrote them.
function setProfileSection(section: string, values: Record<string, string>) {
    const lines = readProfile();
    let start = lines.indexOf(`[${section}]`);
    if (start < 0) {
        if (lines.length && lines[lines.length - 1] !== '') lines.push('');
        lines.push(`[${section}]`, '');
        start = lines.length - 2;
    }
    let end = lines.findIndex((line, i) => i > start && line.startsWith('['));
    if (end < 0) end = lines.length;
    const kept = lines.slice(start + 1, end).filter(line => line !== '' && !(line.split('=')[0] in values));
    const body = [...kept, ...Object.entries(values).map(([key, value]) => `${key}=${value}`), ''];
    lines.splice(start + 1, end - start - 1, ...body);
    writeProfile(lines);
}

function readProfileValue(section: string, key: string): string | undefined {
    const lines = readProfile();
    const start = lines.indexOf(`[${section}]`);
    if (start < 0) return undefined;
    for (const line of lines.slice(start + 1)) {
        if (line.startsWith('[')) break;
        if (line.startsWith(`${key}=`)) return line.slice(key.length + 1);
    }
    return undefined;
}

function writePlayerProfile(profile: PlayerProfile) {
    const flags = Number(readProfileValue('Playlist.Manager', 'Flags') ?? defaultPlaylistFlags);
    setProfileSection('Playlist.Manager', {
        Flags: String(profile.switchesColumn ? flags | switchesColumnFlag : flags & ~switchesColumnFlag),
    });
}

function writePluginSettings(settings: PluginSettings) {
    const flag = (on: boolean) => (on ? '1' : '0');
    setProfileSection('AIMPRemoteControl', {
        PlayerName: settings.playerName,
        'Auth\\Enabled': flag(settings.auth !== null),
        'Auth\\Username': settings.auth?.username ?? '',
        'Auth\\HA1': settings.auth ? md5(`${settings.auth.username}:${authRealm}:${settings.auth.password}`) : '',
        'Features\\PhysicalDeletion': flag(settings.physicalDeletion),
        'Features\\DownloadTracks': flag(settings.downloadTracks),
        'Features\\UploadTracks': flag(settings.uploadTracks),
        'Features\\UploadFolder': uploadDir,
        'Features\\Scheduler': flag(settings.scheduler),
        'Features\\BrowseFiles': flag(settings.browseFiles),
    });
}

// The junction is unlinked, never walked: it points at the built plugin.
function removePlayerDir() {
    try {
        if (fs.lstatSync(pluginLink).isSymbolicLink()) fs.rmdirSync(pluginLink);
    } catch {
        // No link to remove.
    }
    fs.rmSync(playerDir, { recursive: true, force: true });
}

// A portable copy of the installed player: its binaries, its own AIMP.ini with the
// profile beside the exe, the built plugin linked in, the profile seeded. Nothing
// else of the installation is needed: no skins, languages or bundled plugins.
function preparePlayerDir() {
    const installDir = process.env.AIMP_DIR ?? defaultInstallDir;
    if (!fs.existsSync(path.join(installDir, 'AIMP.exe')))
        throw new Error(`AIMP.exe is not in ${installDir}; set AIMP_DIR to the player's folder`);
    if (!fs.existsSync(path.join(pluginDistDir, 'aimp_remote_control.dll')))
        throw new Error(
            `the plugin is not built: ${pluginDistDir} has no aimp_remote_control.dll (run plugin/build-windows.ps1 -Arch x64)`,
        );

    removePlayerDir();
    fs.mkdirSync(path.join(playerDir, 'Plugins'), { recursive: true });
    fs.mkdirSync(path.join(playerDir, 'Profile'));
    fs.mkdirSync(uploadDir, { recursive: true });
    for (const entry of fs.readdirSync(installDir, { withFileTypes: true }))
        if (entry.isFile() && (entry.name === 'AIMP.exe' || entry.name.toLowerCase().endsWith('.dll')))
            fs.copyFileSync(path.join(installDir, entry.name), path.join(playerDir, entry.name));

    // The player's own AIMP.ini, with UserMode=0: the portable mode that keeps the
    // profile in Profile\ beside the exe.
    const settings = fs
        .readFileSync(path.join(installDir, 'AIMP.ini'), 'utf8')
        .split(/\r?\n/)
        .filter(line => !/^UserMode=/.test(line) && line !== '');
    settings.splice(1, 0, 'UserMode=0');
    fs.writeFileSync(path.join(playerDir, 'AIMP.ini'), settings.join('\r\n') + '\r\n');

    fs.symlinkSync(pluginDistDir, pluginLink, 'junction');
    writePluginSettings(defaultPluginSettings);
    writePlayerProfile(defaultPlayerProfile);
    // A run stays silent.
    setProfileSection('AIMPSoundOut', { Mute: '1' });
}

async function waitUntilReady(url: string, pid: number) {
    const deadline = Date.now() + startTimeout;
    while (Date.now() < deadline) {
        if (!isAlive(pid))
            throw new Error(
                'the throwaway AIMP exited right after starting: another AIMP is probably running and took over',
            );
        try {
            // Any answer will do, a Digest challenge included.
            await fetch(`${url}/api/v1/settings`);
            return;
        } catch {
            // Not listening yet.
        }
        await sleep(250);
    }
    throw new Error(`the throwaway AIMP did not answer at ${url} within ${startTimeout / 1000} s`);
}

async function start(url: string) {
    const child = spawn(path.join(playerDir, 'AIMP.exe'), [], { cwd: playerDir, detached: true, stdio: 'ignore' });
    child.unref();
    if (!child.pid) throw new Error('AIMP.exe did not start');
    fs.writeFileSync(pidFile, String(child.pid));
    await waitUntilReady(url, child.pid);
}

// Starts a fresh throwaway player and waits for the plugin to answer. Refuses
// while another AIMP runs: the player allows one instance, and a second start
// would hand over to the running one.
export async function launchThrowawayPlayer(url: string): Promise<string> {
    await stopThrowawayPlayer();
    const others = runningPlayerPids();
    if (others.length)
        throw new Error(
            `AIMP is running (pid ${others.join(', ')}): close it before the tests. The player runs one instance only, and the tests need their own.`,
        );
    preparePlayerDir();
    await start(url);
    return playerDir;
}

// Restarts the throwaway player with other settings of the plugin and of the
// player, which they read when it starts; the rest of its profile, playlists
// included, is kept.
export async function restartThrowawayPlayer(
    url: string,
    settings: PluginSettings,
    profile: PlayerProfile = defaultPlayerProfile,
): Promise<void> {
    await stopThrowawayPlayer();
    writePluginSettings(settings);
    writePlayerProfile(profile);
    await start(url);
}

// Closes the throwaway player through its own command line, as its menu would,
// so that it saves its profile: the running copy takes -EXIT over from the
// second one. One that does not go (a dialog of its own open) is killed, so
// that a run never hangs.
export async function stopThrowawayPlayer(): Promise<void> {
    const pid = savedPid();
    if (pid) {
        execFileSync(path.join(playerDir, 'AIMP.exe'), ['-EXIT'], { cwd: playerDir, stdio: 'ignore' });
        const deadline = Date.now() + stopTimeout;
        while (isAlive(pid) && Date.now() < deadline) await sleep(250);
        if (isAlive(pid)) {
            console.warn('e2e: the throwaway AIMP did not quit and is killed');
            execFileSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore' });
        }
    }
    fs.rmSync(pidFile, { force: true });
}

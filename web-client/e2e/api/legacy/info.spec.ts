import { expect, test } from '../../fixtures';
import { legacyPlaylistId, legacyTrackIds } from '../../lib/legacy';

type ControlPanelState = {
    playback_state: string;
    playlist_id: number;
    track_id: number;
    track_length?: number;
    track_position?: number;
    volume: number;
    mute_mode_on: boolean;
    repeat_mode_on: boolean;
    shuffle_mode_on: boolean;
    radio_capture_mode_on: boolean;
    current_track_source_radio?: boolean;
};

test.describe('frozen protocol: player information', () => {
    test('Version reports protocol 1.2.0.5', async ({ api }) => {
        const version = await api.rpcResult<{ aimp_version: string; plugin_version: string }>('Version');
        expect(version.plugin_version).toBe('1.2.0.5');
        expect(version.aimp_version).toMatch(/^v\d+\.\d+/);
    });

    test('PluginCapabilities reflects the permissions', async ({ api }) => {
        expect(await api.rpcResult('PluginCapabilities')).toEqual({
            physical_track_deletion: true,
            upload_track: true,
            scheduler: { supported: true, allowed: true },
        });
    });

    test('GetPlayerControlPanelState describes a playing and a stopped player', async ({ api, playlists }) => {
        const playlist = await playlists.create({ tracks: [{ seconds: 20 }] });
        const legacyId = await legacyPlaylistId(api, playlist.name);
        const [trackId] = await legacyTrackIds(api, legacyId);
        await api.play(playlist.id, 0);
        await expect.poll(async () => (await api.player()).state).toBe('playing');

        const playing = await api.rpcResult<ControlPanelState>('GetPlayerControlPanelState');
        expect(playing).toMatchObject({
            playback_state: 'playing',
            playlist_id: legacyId,
            track_id: trackId,
            track_length: 20,
            current_track_source_radio: false,
        });
        expect(typeof playing.volume).toBe('number');

        await api.command('stop');
        await expect.poll(async () => (await api.player()).state, { timeout: 5000 }).toBe('stopped');
        const stopped = await api.rpcResult<ControlPanelState>('GetPlayerControlPanelState');
        expect(stopped.playback_state).toBe('stopped');
        // Stopped, the state names the track the player would start, without times.
        expect(stopped.track_id).toBe(trackId);
        expect(stopped).not.toHaveProperty('track_length');
        expect(stopped).not.toHaveProperty('track_position');
    });

    test('an unknown method is a JSON-RPC error', async ({ api }) => {
        const response = await api.rpc('NoSuchMethod');
        expect(response.error?.code).toBe(-32601);
    });
});

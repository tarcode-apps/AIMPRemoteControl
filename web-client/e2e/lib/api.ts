import type {
    EffectsPatch,
    EffectsState,
    EqualizerPreset,
    PlayerPatch,
    PlayerState,
    Playlist,
    PlaylistGroups,
    PlaylistItemsPage,
    Queue,
    TimerState,
} from '@/app/_api/types';
import type { APIRequestContext } from '@playwright/test';

export type ApiErrorBody = { code: string; message: string; files?: string[] };

export type ApiResponse<T = unknown> = {
    status: number;
    headers: Record<string, string>;
    // The JSON answer, null without one.
    body: T | null;
    // The error object of a refused request, as docs/web-api.md describes it.
    error?: ApiErrorBody;
};

export type RpcResponse<T = unknown> = {
    result?: T;
    error?: { code: number; message: string };
};

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

// Every effect at its value with the effect off, the equalizer on and flat.
export const flatEffects: EffectsPatch = {
    balance: 0,
    echo: 0,
    reverb: 0,
    flanger: 0,
    chorus: 0,
    trueBass: 0,
    enhancer: 1,
    speed: 1,
    tempo: 1,
    pitch: 0,
    equalizer: {
        active: true,
        auto: false,
        preamp: 0,
        bands: Array.from({ length: 20 }, (_, index) => ({ index, gain: 0 })),
    },
};

const encode = encodeURIComponent;

// The plugin's web API and its frozen JSON-RPC, over Playwright's request
// context. The raw methods answer status and body for the tests of the API
// itself; the named ones are the calls the fixtures and the UI tests make and
// expect to succeed.
export class Api {
    constructor(readonly context: APIRequestContext) {}

    async request<T = unknown>(method: Method, route: string, body?: unknown): Promise<ApiResponse<T>> {
        const response = await this.context.fetch(`/api/v1${route}`, { method, data: body, maxRedirects: 0 });
        const text = await response.text();
        const headers = response.headers();
        const json: unknown = text && headers['content-type']?.includes('application/json') ? JSON.parse(text) : null;
        const error = (json as { error?: ApiErrorBody } | null)?.error;
        return { status: response.status(), headers, body: json as T | null, error };
    }

    get<T = unknown>(route: string) {
        return this.request<T>('GET', route);
    }
    post<T = unknown>(route: string, body?: unknown) {
        return this.request<T>('POST', route, body);
    }
    patch<T = unknown>(route: string, body: unknown) {
        return this.request<T>('PATCH', route, body);
    }
    put<T = unknown>(route: string, body: unknown) {
        return this.request<T>('PUT', route, body);
    }
    delete<T = unknown>(route: string, body?: unknown) {
        return this.request<T>('DELETE', route, body);
    }

    // A method of the frozen protocol, as the Android app calls it.
    async rpc<T = unknown>(method: string, params: unknown = {}): Promise<RpcResponse<T>> {
        const response = await this.context.post('/RPC_JSON', {
            data: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        });
        return response.json();
    }

    // The result of a method of the frozen protocol the caller counts on.
    async rpcResult<T = unknown>(method: string, params: unknown = {}): Promise<T> {
        const response = await this.rpc<T>(method, params);
        if (response.error) throw new Error(`${method}: the player answered ${JSON.stringify(response.error)}`);
        return response.result as T;
    }

    // The body of an answer the caller counts on; any other answer fails the test
    // with what the player said.
    private async expectOk<T>(call: Promise<ApiResponse<T>>, what: string): Promise<T> {
        const response = await call;
        if (response.status < 200 || response.status >= 300)
            throw new Error(
                `${what}: the player answered ${response.status} ${JSON.stringify(response.error ?? response.body)}`,
            );
        return response.body as T;
    }

    // Effects.

    effects() {
        return this.expectOk(this.get<EffectsState>('/effects'), 'reading the effects');
    }

    setEffects(patch: EffectsPatch) {
        return this.expectOk(this.patch<EffectsState>('/effects', patch), 'setting the effects');
    }

    resetEffects() {
        return this.setEffects(flatEffects);
    }

    async presetNames(): Promise<string[]> {
        const presets = await this.expectOk(this.get<EqualizerPreset[]>('/effects/presets'), 'listing the presets');
        return presets.map(preset => preset.name);
    }

    removePreset(name: string) {
        return this.expectOk(this.post('/effects/presets/remove', { name }), `removing the preset ${name}`);
    }

    // Playlists.

    playlists() {
        return this.expectOk(this.get<Playlist[]>('/playlists'), 'listing the playlists');
    }

    async playlist(id: string): Promise<Playlist | undefined> {
        return (await this.playlists()).find(playlist => playlist.id === id);
    }

    async createPlaylist(name: string): Promise<string> {
        const created = await this.expectOk(
            this.post<{ id: string }>('/playlists', { name }),
            `creating the playlist ${name}`,
        );
        return created.id;
    }

    deletePlaylist(id: string) {
        return this.expectOk(this.delete(`/playlists/${encode(id)}`), `deleting the playlist ${id}`);
    }

    addFiles(playlistId: string, files: string[]) {
        return this.addItems(playlistId, files, []);
    }

    addItems(playlistId: string, files: string[], urls: string[]) {
        const body: { files?: string[]; urls?: string[] } = {};
        if (files.length) body.files = files;
        if (urls.length) body.urls = urls;
        return this.expectOk(this.post(`/playlists/${encode(playlistId)}/items`, body), 'adding items');
    }

    async playlistItemCount(id: string): Promise<number> {
        return (await this.playlist(id))?.itemCount ?? -1;
    }

    items(playlistId: string, query = '') {
        return this.expectOk(
            this.get<PlaylistItemsPage>(`/playlists/${encode(playlistId)}/items${query}`),
            'reading the items',
        );
    }

    // Every item of a playlist, a page of the largest size at a time.
    async allItems(playlistId: string) {
        const items: PlaylistItemsPage['items'] = [];
        for (;;) {
            const page = await this.items(playlistId, `?offset=${items.length}&limit=500`);
            items.push(...page.items);
            if (page.items.length < 500) return items;
        }
    }

    groups(playlistId: string, query = '') {
        return this.expectOk(
            this.get<PlaylistGroups>(`/playlists/${encode(playlistId)}/groups${query}`),
            'reading the groups',
        );
    }

    // Player.

    player() {
        return this.expectOk(this.get<PlayerState>('/player'), 'reading the player');
    }

    play(playlistId: string, index: number) {
        return this.expectOk(this.post('/player/play', { playlistId, index }), `playing item ${index}`);
    }

    command(command: 'play' | 'pause' | 'stop' | 'next' | 'previous') {
        return this.expectOk(this.post(command === 'play' ? '/player/play' : `/player/${command}`), command);
    }

    setPlayer(patch: PlayerPatch) {
        return this.expectOk(this.patch('/player', patch), 'setting the player');
    }

    // Queue.

    queue() {
        return this.expectOk(this.get<Queue>('/queue'), 'reading the queue');
    }

    enqueue(playlistId: string, indexes: number[], atBeginning = false) {
        return this.expectOk(this.post('/queue/items', { playlistId, indexes, atBeginning }), 'queueing items');
    }

    clearQueue() {
        return this.expectOk(this.delete('/queue'), 'clearing the queue');
    }

    // Timer.

    timer() {
        return this.expectOk(this.get<TimerState>('/timer'), 'reading the timer');
    }

    cancelTimer() {
        return this.expectOk(this.delete('/timer'), 'cancelling the timer');
    }
}

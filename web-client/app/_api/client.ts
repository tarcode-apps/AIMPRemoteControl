import { ApiError, HttpError, NetworkError } from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RequestOptions = {
    body?: unknown;
    signal?: AbortSignal;
};

const basePath = '/api/v1';

export async function request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(basePath + path, {
            method,
            headers: {
                Accept: 'application/json',
                ...(options.body !== undefined && { 'Content-Type': 'application/json' }),
            },
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            signal: options.signal,
            cache: 'no-store',
        });
    } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
        throw new NetworkError(cause);
    }

    const isJson = response.headers.get('Content-Type')?.includes('application/json') ?? false;
    if (response.ok) {
        if (response.status === 204) return undefined as T;
        if (!isJson) throw new HttpError(response.status);
        return (await response.json()) as T;
    }

    if (isJson) {
        const body: unknown = await response.json();
        const error = (body as { error?: { code?: unknown; message?: unknown } })?.error;
        if (typeof error?.code === 'string')
            throw new ApiError(
                response.status,
                error.code,
                typeof error.message === 'string' ? error.message : error.code,
            );
    }
    throw new HttpError(response.status);
}

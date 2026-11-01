import { ApiError, HttpError, NetworkError } from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RequestOptions = {
    body?: unknown;
    signal?: AbortSignal;
};

export const basePath = '/api/v1';

// The error of a failed response: the API's own when the body carries one.
export function responseError(status: number, contentType: string | null, text: string): Error {
    if (contentType?.includes('application/json')) {
        const body: unknown = JSON.parse(text);
        const error = (body as { error?: { code?: unknown; message?: unknown } })?.error;
        if (typeof error?.code === 'string')
            return new ApiError(status, error.code, typeof error.message === 'string' ? error.message : error.code);
    }
    return new HttpError(status);
}

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

    const contentType = response.headers.get('Content-Type');
    if (response.ok) {
        if (response.status === 204) return undefined as T;
        if (!contentType?.includes('application/json')) throw new HttpError(response.status);
        return (await response.json()) as T;
    }
    throw responseError(response.status, contentType, await response.text());
}

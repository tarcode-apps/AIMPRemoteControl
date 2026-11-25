import { reportConnectionFailure } from './connection';
import { ApiError, HttpError, isConnectionError, NetworkError } from './errors';
import { transport, type Answer, type HttpMethod } from './transport';

export type RequestOptions = {
    body?: unknown;
    signal?: AbortSignal;
};

export const basePath = '/api/v1';

// The error of a failed response: the API's own when the body carries one.
export function responseError(status: number, contentType: string | null, text: string): Error {
    if (contentType?.includes('application/json')) {
        const body: unknown = JSON.parse(text);
        const error = (body as { error?: { code?: unknown; message?: unknown; files?: unknown } })?.error;
        if (typeof error?.code === 'string')
            return new ApiError(
                status,
                error.code,
                typeof error.message === 'string' ? error.message : error.code,
                Array.isArray(error.files)
                    ? error.files.filter((file): file is string => typeof file === 'string')
                    : [],
            );
    }
    return new HttpError(status);
}

export async function request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
    let answer: Answer;
    try {
        const { send } = await transport;
        const body = options.body === undefined ? undefined : JSON.stringify(options.body);
        answer = await send(method, basePath + path, body, options.signal);
    } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
        reportConnectionFailure();
        throw new NetworkError(cause);
    }

    const { status, contentType, text } = answer;
    if (status >= 200 && status < 300) {
        if (status === 204) return undefined as T;
        if (!contentType?.includes('application/json')) throw new HttpError(status);
        return JSON.parse(text) as T;
    }
    const error = responseError(status, contentType, text);
    if (isConnectionError(error)) reportConnectionFailure();
    throw error;
}

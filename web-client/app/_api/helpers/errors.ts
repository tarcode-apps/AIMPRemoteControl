import type { TFunction } from 'i18next';

export class ApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
        // The files the error is about, when it names some.
        readonly files: string[] = [],
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

export class HttpError extends Error {
    constructor(readonly status: number) {
        super(`HTTP ${status}`);
        this.name = 'HttpError';
    }
}

export class NetworkError extends Error {
    constructor(cause: unknown) {
        super('Network error', { cause });
        this.name = 'NetworkError';
    }
}

// The statuses an answer without a body of its own may carry, from the HTTP
// server itself or a proxy in front of the player.
const knownStatuses = [400, 401, 403, 404, 413, 500, 502, 503, 504, 507] as const;
type KnownStatus = (typeof knownStatuses)[number];
const isKnownStatus = (status: number): status is KnownStatus => knownStatuses.includes(status as KnownStatus);

// No player answered: the network failed, or a proxy in front of the player
// found it down.
export function isConnectionError(error: unknown): boolean {
    return (
        error instanceof NetworkError ||
        (error instanceof HttpError && (error.status === 502 || error.status === 503 || error.status === 504))
    );
}

export function errorMessage(error: unknown, t: TFunction): string {
    if (error instanceof ApiError) return error.message;
    if (error instanceof HttpError)
        return isKnownStatus(error.status)
            ? t(`errors.status.${error.status}`)
            : t('errors.http', { status: error.status });
    if (error instanceof NetworkError) return t('errors.network');
    return error instanceof Error ? error.message : String(error);
}

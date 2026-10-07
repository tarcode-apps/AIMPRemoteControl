import type { TFunction } from 'i18next';

export class ApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
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

export function errorMessage(error: unknown, t: TFunction): string {
    if (error instanceof ApiError) return error.message;
    if (error instanceof HttpError) return t('errors.http', { status: error.status });
    if (error instanceof NetworkError) return t('errors.network');
    return error instanceof Error ? error.message : String(error);
}

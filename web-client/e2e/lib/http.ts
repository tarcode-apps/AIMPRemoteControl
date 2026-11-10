import http from 'node:http';

// A multipart body of file parts, each named by its path as the web client
// names them, for a request of Playwright's.
export function multipart(files: { name: string; content: Buffer | string }[]) {
    const boundary = 'rc-e2e-boundary';
    const parts = files.flatMap(({ name, content }) => [
        Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\n` +
                'Content-Type: application/octet-stream\r\n\r\n',
        ),
        Buffer.from(content),
        Buffer.from('\r\n'),
    ]);
    return {
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        data: Buffer.concat([...parts, Buffer.from(`--${boundary}--\r\n`)]),
    };
}

// A multipart upload that stops halfway: the whole `first` file, then the
// start of `second`, and nothing more until `breakOff` drops the connection.
// The Content-Length promises more, so the server waits for the rest meanwhile.
export function startUpload(playerUrl: string, path: string, first: string, second: string) {
    const boundary = 'rc-e2e-boundary';
    const part = (name: string) =>
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\n` +
        'Content-Type: audio/wav\r\n\r\n';
    const request = http.request(`${playerUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': 10_000_000 },
    });
    request.on('error', () => {});
    request.write(`${part(first)}${'a'.repeat(1000)}\r\n${part(second)}${'b'.repeat(1000)}`);
    return { breakOff: () => request.destroy() };
}

// A multipart upload that keeps coming a byte at a time, as one over a slow
// network does, until `stop` drops the connection.
export function trickleUpload(playerUrl: string, path: string, name: string) {
    const boundary = 'rc-e2e-boundary';
    const request = http.request(`${playerUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': 10_000_000 },
    });
    request.on('error', () => {});
    request.write(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\n` +
            'Content-Type: audio/wav\r\n\r\n',
    );
    const timer = setInterval(() => request.write('a'), 500);
    return {
        stop: () => {
            clearInterval(timer);
            request.destroy();
        },
    };
}

// The status the server answers to a POST's headers alone: a refusal by size
// or credentials comes before the body is read, so none is sent.
export function statusForHeaders(
    playerUrl: string,
    path: string,
    headers: Record<string, string | number>,
): Promise<number> {
    return new Promise((resolve, reject) => {
        const request = http.request(`${playerUrl}${path}`, { method: 'POST', headers }, response => {
            response.resume();
            resolve(response.statusCode ?? 0);
            request.destroy();
        });
        request.on('error', reject);
        request.flushHeaders();
    });
}

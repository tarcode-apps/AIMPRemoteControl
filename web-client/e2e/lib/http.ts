import http from 'node:http';

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

import crypto from 'node:crypto';

const md5 = (text: string) => crypto.createHash('md5').update(text).digest('hex');

export type Challenge = {
    realm: string;
    nonce: string;
    qop?: string;
    algorithm?: string;
    stale: boolean;
};

// The fields of a `WWW-Authenticate: Digest …` header.
export function parseChallenge(header: string | null): Challenge | undefined {
    if (!header?.startsWith('Digest ')) return undefined;
    const fields = Object.fromEntries(
        [...header.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)].map(([, key, quoted, plain]) => [key, quoted ?? plain]),
    );
    return {
        realm: fields.realm,
        nonce: fields.nonce,
        qop: fields.qop,
        algorithm: fields.algorithm,
        stale: fields.stale === 'true',
    };
}

// The `Authorization` header for one request, with qop=auth as RFC 7616 has it.
export function authorization(
    challenge: Challenge,
    { username, password, method, uri }: { username: string; password: string; method: string; uri: string },
): string {
    const ha1 = md5(`${username}:${challenge.realm}:${password}`);
    const ha2 = md5(`${method}:${uri}`);
    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');
    const response = md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:auth:${ha2}`);
    return (
        `Digest username="${username}", realm="${challenge.realm}", nonce="${challenge.nonce}", uri="${uri}", ` +
        `algorithm=MD5, qop=auth, nc=${nc}, cnonce="${cnonce}", response="${response}"`
    );
}

export type ServerEvent<T = unknown> = { name: string; data: T };

// The plugin's Server-Sent Events, collected from the moment the stream opened.
export class EventStream {
    private readonly events: ServerEvent[] = [];
    private readonly listeners = new Set<() => void>();
    private readonly controller = new AbortController();

    private constructor() {}

    // Open and past its `hello`, so that every event the test causes is seen.
    static async open(playerUrl: string): Promise<EventStream> {
        const stream = new EventStream();
        const response = await fetch(`${playerUrl}/api/v1/events`, { signal: stream.controller.signal });
        if (!response.ok || !response.body) throw new Error(`the event stream answered ${response.status}`);
        void stream.read(response.body);
        await stream.next('hello');
        return stream;
    }

    received(name: string): ServerEvent[] {
        return this.events.filter(event => event.name === name);
    }

    // Where the stream stands now, for `next` to look from.
    mark(): number {
        return this.events.length;
    }

    // The first event of the name that satisfies the predicate, arriving from now
    // on or since a `mark()`; a test fails when none does within the timeout.
    // Looking from a mark taken before a request catches an event that arrives
    // before the request returns what the predicate needs, such as a new id.
    next<T = unknown>(
        name: string,
        predicate: (data: T) => boolean = () => true,
        { timeout = 10_000, since }: { timeout?: number; since?: number } = {},
    ): Promise<T> {
        const from = since ?? this.events.length;
        return new Promise<T>((resolve, reject) => {
            const check = () => {
                for (let i = from; i < this.events.length; i++) {
                    const event = this.events[i];
                    if (event.name === name && predicate(event.data as T)) {
                        clearTimeout(timer);
                        this.listeners.delete(check);
                        resolve(event.data as T);
                        return true;
                    }
                }
                return false;
            };
            const timer = setTimeout(() => {
                this.listeners.delete(check);
                reject(new Error(`no ${name} event within ${timeout} ms`));
            }, timeout);
            if (!check()) this.listeners.add(check);
        });
    }

    close() {
        this.controller.abort();
    }

    private async read(body: ReadableStream<Uint8Array>) {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            for (;;) {
                const { value, done } = await reader.read();
                if (done) return;
                buffer += decoder.decode(value, { stream: true });
                let end;
                while ((end = buffer.indexOf('\n\n')) >= 0) {
                    const block = buffer.slice(0, end);
                    buffer = buffer.slice(end + 2);
                    const name = /^event: (.*)$/m.exec(block)?.[1];
                    const data = /^data: (.*)$/m.exec(block)?.[1];
                    if (name === undefined) continue;
                    this.events.push({ name, data: data === undefined ? null : JSON.parse(data) });
                    for (const listener of [...this.listeners]) listener();
                }
            }
        } catch (error) {
            if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
        }
    }
}

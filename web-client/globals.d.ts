export {};

declare global {
    interface RegExpConstructor {
        // ES2025, typed by TypeScript only from version 6: drop this then. The
        // e2e tests use it, in Node; the client may not, its browsers may lack it.
        escape(text: string): string;
    }
}

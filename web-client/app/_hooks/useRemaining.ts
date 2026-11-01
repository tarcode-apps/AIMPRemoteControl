import { useEffect, useState } from 'react';

// Milliseconds to the moment, re-rendered as each whole second of them passes;
// zero without a moment.
export function useRemaining(expiresAt: number | undefined): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (expiresAt === undefined) return;
        let timer: number;
        const schedule = () => {
            const wait = (((expiresAt - Date.now()) % 1000) + 1000) % 1000 || 1000;
            timer = window.setTimeout(() => {
                setNow(Date.now());
                schedule();
            }, wait + 20);
        };
        schedule();
        return () => window.clearTimeout(timer);
    }, [expiresAt]);
    return expiresAt === undefined ? 0 : Math.max(0, expiresAt - now);
}

'use client';

import { isSelectAllKey, useGlobalKey } from '@/app/_hooks/useGlobalKey';

// The keys the application takes from the browser wherever they are pressed;
// the lists take Ctrl+A for themselves when they are on screen.
export function AppKeys() {
    useGlobalKey(isSelectAllKey);
    return null;
}

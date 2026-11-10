'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type FileDragValue = {
    // Files are being dragged over the page.
    active: boolean;
    // Whether they are over this element or one in it.
    isOver(element: Element | null): boolean;
};

const FileDragContext = createContext<FileDragValue | null>(null);

export function useFileDrag(): FileDragValue {
    const value = useContext(FileDragContext);
    if (!value) throw new Error('useFileDrag must be used inside <FileDragProvider>');
    return value;
}

export function hasFiles(event: { dataTransfer: DataTransfer | null }) {
    return event.dataTransfer?.types.includes('Files') ?? false;
}

// Follows files dragged in from outside, so that every place that takes them can
// show itself while they are on their way.
export function FileDragProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<{ active: boolean; target: Node | null }>({ active: false, target: null });

    useEffect(() => {
        // Every element entered counts, and each is left again after the next is
        // entered: the drag is over the page while the count is above zero.
        let entered = 0;
        // The browser fires dragover at least every 350 ms while files are over the
        // page, so a quiet second means the drag ended without a dragleave, as a
        // cancelled one may.
        let quiet = 0;
        const end = () => {
            entered = 0;
            clearTimeout(quiet);
            setState({ active: false, target: null });
        };
        const over = (target: EventTarget | null) => {
            clearTimeout(quiet);
            quiet = window.setTimeout(end, 1000);
            setState(current =>
                current.active && current.target === target ? current : { active: true, target: target as Node },
            );
        };
        const onDragEnter = (event: DragEvent) => {
            if (!hasFiles(event)) return;
            entered++;
            over(event.target);
        };
        const onDragOver = (event: DragEvent) => {
            if (!hasFiles(event)) return;
            // Dropped where nothing takes them, the browser would open the file in
            // place of the page.
            if (!event.defaultPrevented) {
                event.preventDefault();
                event.dataTransfer!.dropEffect = 'none';
            }
            over(event.target);
        };
        const onDragLeave = (event: DragEvent) => {
            if (hasFiles(event) && --entered <= 0) end();
        };
        window.addEventListener('dragenter', onDragEnter);
        window.addEventListener('dragover', onDragOver);
        window.addEventListener('dragleave', onDragLeave);
        window.addEventListener('drop', end);
        return () => {
            clearTimeout(quiet);
            window.removeEventListener('dragenter', onDragEnter);
            window.removeEventListener('dragover', onDragOver);
            window.removeEventListener('dragleave', onDragLeave);
            window.removeEventListener('drop', end);
        };
    }, []);

    const value: FileDragValue = {
        active: state.active,
        isOver: element => state.active && element !== null && state.target !== null && element.contains(state.target),
    };
    return <FileDragContext value={value}>{children}</FileDragContext>;
}

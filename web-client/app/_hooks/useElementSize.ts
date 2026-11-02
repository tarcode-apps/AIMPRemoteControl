import { useLayoutEffect, useState, type RefObject } from 'react';

export type ElementSize = {
    width: number;
    height: number;
};

// The element's content box, following its resizes; zero until the first measure.
// The border box stays put when a scrollbar of the element comes or goes.
export function useElementSize(ref: RefObject<HTMLElement | null>, box: 'content' | 'border' = 'content'): ElementSize {
    const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => {
            const { inlineSize: width, blockSize: height } = (
                box === 'border' ? entry.borderBoxSize : entry.contentBoxSize
            )[0];
            setSize(previous =>
                previous.width === width && previous.height === height ? previous : { width, height },
            );
        });
        observer.observe(element, { box: box === 'border' ? 'border-box' : 'content-box' });
        return () => observer.disconnect();
    }, [ref, box]);

    return size;
}

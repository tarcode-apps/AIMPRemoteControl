'use client';

import { coverPixels, coverStep, type CoverSize } from '@/app/_api/covers';
import clsx from 'clsx';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '../icons';
import styles from './Cover.module.scss';
import { useCoverLoad } from './useCoverLoad';

export type CoverProps = {
    // Names the cover; without it the placeholder shows. A change starts a new
    // load, cancelling the one before, and asks the server again even for the
    // same URL.
    id?: string;
    // The cover's URL for a size.
    urlFor?: (size: CoverSize) => string;
    // The box's CSS size when it is fixed; otherwise the box is measured.
    size?: number;
    className?: string;
    style?: CSSProperties;
};

type Shown = { url: string; objectUrl?: string };

// The image on screen stays until the next one has loaded, which then fades in
// over it, so a track switch does not blink through the placeholder.
export function Cover({ id, urlFor, size, className, style }: CoverProps) {
    const box = useRef<HTMLDivElement>(null);
    const [measured, setMeasured] = useState(0);
    useLayoutEffect(() => {
        if (size) return;
        const measure = () => setMeasured(Math.ceil(box.current!.getBoundingClientRect().width));
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(box.current!);
        return () => observer.disconnect();
    }, [size]);
    // The step only grows for one cover: a box that got smaller keeps the larger
    // image it has rather than fetching a smaller one.
    const cssSize = size ?? measured;
    const [chosen, setChosen] = useState<{ id?: string; step: CoverSize }>();
    const fits = cssSize ? coverStep(cssSize) : undefined;
    if (fits && (!chosen || chosen.id !== id || coverPixels(fits) > coverPixels(chosen.step)))
        setChosen({ id, step: fits });
    const url = id && urlFor && chosen && chosen.id === id ? urlFor(chosen.step) : undefined;

    const load = useCoverLoad(url, url && `${id}/${chosen?.step}`);
    const [current, setCurrent] = useState<Shown>();
    const [previous, setPrevious] = useState<string>();
    if (load && url && (current?.url !== url || current.objectUrl !== load.objectUrl)) {
        // Nothing fades in over the placeholder, so the last image goes at once.
        setPrevious(load.objectUrl ? current?.objectUrl : undefined);
        setCurrent({ url, objectUrl: load.objectUrl });
    }
    if (!id && current) {
        setPrevious(undefined);
        setCurrent(undefined);
    }

    return (
        <div ref={box} className={clsx(styles.cover, className)} style={style}>
            <Icon>music_note</Icon>
            {previous && (
                // The plugin serves the images itself; there is no optimizer for next/image to use.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previous} alt="" className={styles.image} />
            )}
            {current?.objectUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    key={current.objectUrl}
                    src={current.objectUrl}
                    alt=""
                    className={clsx(styles.image, previous && styles.fading)}
                    onAnimationEnd={() => setPrevious(undefined)}
                />
            )}
        </div>
    );
}

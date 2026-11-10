'use client';

import { useBackGesture } from '@/app/_hooks/useBackGesture';
import { usePinchZoom } from '@/app/_hooks/usePinchZoom';
import { useEffect, useEffectEvent, useRef, useState, type SyntheticEvent } from 'react';
import styles from './TrackInfo.module.scss';

export type CoverViewerProps = {
    // The image's URL; null while the viewer is closed.
    src: string | null;
    label: string;
    // Where the cover sits on the screen, which the image grows from and goes back to.
    origin(): DOMRect | undefined;
    onClose(): void;
};

const motion = { duration: 250, easing: 'cubic-bezier(0.2, 0, 0, 1)' };

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// The transform that puts the image's picture over `rect`. The image fills the
// viewer and `object-fit: contain` centres the picture in it, so the picture's
// centre is the viewer's, whatever the transform the image has now.
function over(image: HTMLImageElement, rect: DOMRect): string {
    const viewer = image.parentElement!.getBoundingClientRect();
    const fit = Math.min(image.offsetWidth / image.naturalWidth, image.offsetHeight / image.naturalHeight);
    const scale = rect.width / (image.naturalWidth * fit);
    const x = rect.left + rect.width / 2 - (viewer.left + viewer.width / 2);
    const y = rect.top + rect.height / 2 - (viewer.top + viewer.height / 2);
    return `translate(${x}px, ${y}px) scale(${scale})`;
}

// The cover over everything, edge to edge, zoomed by a pinch or the wheel. It
// grows out of the cover on the screen and goes back into it. The image has a
// real URL, so that the browser's own menu, a right click or a long press,
// saves, copies or shares it. A tap, Escape or back closes it.
export function CoverViewer({ src, label, origin, onClose }: CoverViewerProps) {
    const ref = useRef<HTMLDialogElement>(null);
    const image = useRef<HTMLImageElement>(null);
    const open = src !== null;
    // The image stays while it goes back into the cover.
    const [shown, setShown] = useState<string | null>(null);
    if (src !== null && shown !== src) setShown(src);
    const back = useBackGesture(open, onClose);
    // Read when the viewer closes; a new function each render must not restart that.
    const originNow = useEffectEvent(origin);

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (open) {
            dialog.classList.remove(styles.closing);
            if (!dialog.open) dialog.showModal();
            return;
        }
        if (!dialog.open) return;
        const picture = image.current;
        const rect = originNow();
        if (!picture?.naturalWidth || !rect || reducedMotion()) {
            dialog.close();
            return;
        }
        dialog.classList.add(styles.closing);
        const animation = picture.animate(
            [{ transform: getComputedStyle(picture).transform }, { transform: over(picture, rect) }],
            { ...motion, fill: 'forwards' },
        );
        // Opened again meanwhile, it stays.
        animation.finished.then(
            () => dialog.classList.contains(styles.closing) && dialog.close(),
            () => {},
        );
        return () => animation.cancel();
    }, [open]);

    // Only a loaded image has a picture to move; it is known from then on. It
    // stays hidden until the animation has started: the browser may paint it at
    // its full size before the load event comes.
    const grow = (picture: HTMLImageElement) => {
        image.current = picture;
        const rect = origin();
        if (rect && !reducedMotion())
            picture.animate([{ transform: over(picture, rect) }, { transform: 'none' }], motion);
        picture.style.visibility = 'visible';
    };

    // Every way out goes through the history entry the viewer added.
    const close = (event?: SyntheticEvent) => {
        event?.preventDefault();
        back.dismiss();
    };

    return (
        <dialog
            ref={ref}
            className={styles.viewer}
            aria-label={label}
            onCancel={close}
            onClose={() => {
                image.current = null;
                setShown(null);
            }}
        >
            {/* Mounted while shown, so that each opening starts unzoomed. */}
            {shown && <ZoomableImage src={shown} alt={label} onLoad={grow} onTap={close} />}
        </dialog>
    );
}

type ZoomableImageProps = {
    src: string;
    alt: string;
    onLoad(image: HTMLImageElement): void;
    onTap(): void;
};

function ZoomableImage({ src, alt, onLoad, onTap }: ZoomableImageProps) {
    const { area, target, areaProps, dragged } = usePinchZoom<HTMLDivElement, HTMLImageElement>();
    return (
        <div
            ref={area}
            className={styles.viewerArea}
            {...areaProps}
            onClick={() => {
                if (!dragged()) onTap();
            }}
        >
            {/* The plugin serves the image itself; there is no optimizer for next/image to use. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                ref={target}
                src={src}
                alt={alt}
                className={styles.viewerImage}
                draggable={false}
                onLoad={event => onLoad(event.currentTarget)}
            />
        </div>
    );
}

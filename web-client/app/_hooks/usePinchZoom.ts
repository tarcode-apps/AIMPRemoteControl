import { useEffect, useEffectEvent, useRef, type CSSProperties, type PointerEvent } from 'react';

type View = { scale: number; x: number; y: number };
type Point = { x: number; y: number };
type Sample = Point & { time: number };

const maxScale = 8;
// A pinch may go below the fitted size for a feel of resistance; it springs back.
const minGestureScale = 0.5;
// How far a finger may wander before a tap is a drag.
const tapSlop = 8;
// After the wheel's last step, which has no end of its own, the view settles.
const wheelSettleDelay = 200;
const settleTransition = 'transform 0.2s ease-out';
// A fling: the speed of the last moments of a drag, which decays as exp(-t / τ),
// as the platforms' own lists and galleries do. Slower than `minFlingSpeed` it
// stops; a finger held still longer than `flingWindow` before it lifts flings nothing.
const flingWindow = 80; // ms
const flingTimeConstant = 325; // ms
const minFlingSpeed = 0.05; // px per ms

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const middle = (points: Point[]): Point => ({
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
});

// Zooms an element inside an area by itself, the page staying as it is: two
// fingers scale it about the point between them, one finger moves a zoomed one
// and flings it on, and the wheel or a touchpad's pinch scales it about the pointer. The
// area turns the browser's own gestures off. The element is centred in the area
// and scaled about its centre.
//
// As in a gallery, the element follows the fingers freely and only settles
// when they let go: to at least its fitted size, and without empty space
// beyond its edges where it is larger than the area, centred where it is not.
// Held to the bounds all along, it would stick to an edge, and scale about that
// edge rather than the fingers, until it outgrew the area.
//
// The transform is written to the element directly, frame by frame, rather
// than rendered: a render per pointer event makes the movement jerky.
export function usePinchZoom<A extends HTMLElement, T extends HTMLElement>() {
    const area = useRef<A>(null);
    const target = useRef<T>(null);
    const current = useRef<View>({ scale: 1, x: 0, y: 0 });
    const pointers = useRef(new Map<number, Point>());
    // The view and the fingers when their number last changed.
    const gesture = useRef<{ view: View; mid: Point; distance: number } | null>(null);
    const start = useRef<Point>({ x: 0, y: 0 });
    const dragged = useRef(false);
    // The last moments of a one-finger drag, for the speed of a fling.
    const samples = useRef<Sample[]>([]);
    const wheelTimer = useRef<number | undefined>(undefined);
    const frame = useRef<number | undefined>(undefined);

    const stopMotion = () => {
        window.clearTimeout(wheelTimer.current);
        if (frame.current !== undefined) cancelAnimationFrame(frame.current);
        frame.current = undefined;
    };
    useEffect(() => stopMotion, []);

    const apply = (next: View, transition = 'none') => {
        current.current = next;
        const style = target.current!.style;
        style.transition = transition;
        style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
    };

    // An image counts by its picture, which `object-fit: contain` leaves inside its box.
    const contentSize = () => {
        const element = target.current!;
        const width = element.offsetWidth;
        const height = element.offsetHeight;
        if (!(element instanceof HTMLImageElement) || !element.naturalWidth) return { width, height };
        const fit = Math.min(width / element.naturalWidth, height / element.naturalHeight);
        return { width: element.naturalWidth * fit, height: element.naturalHeight * fit };
    };

    // How far the element may be moved off centre at `scale`.
    const reach = (scale: number): Point => {
        const box = area.current!.getBoundingClientRect();
        const content = contentSize();
        return {
            x: Math.max(0, (content.width * scale - box.width) / 2),
            y: Math.max(0, (content.height * scale - box.height) / 2),
        };
    };

    const bounded = (view: View): View => {
        const scale = clamp(view.scale, 1, maxScale);
        const limit = reach(scale);
        return { scale, x: clamp(view.x, -limit.x, limit.x), y: clamp(view.y, -limit.y, limit.y) };
    };

    const settle = () => apply(bounded(current.current), settleTransition);

    // Glides on at `velocity`, slowing down, and stops at the edges.
    const fling = (velocity: Point) => {
        let { x: vx, y: vy } = velocity;
        let last = performance.now();
        const step = (now: number) => {
            const dt = now - last;
            last = now;
            const decay = Math.exp(-dt / flingTimeConstant);
            const { scale, x, y } = current.current;
            const limit = reach(scale);
            const nx = clamp(x + vx * dt, -limit.x, limit.x);
            const ny = clamp(y + vy * dt, -limit.y, limit.y);
            vx = nx === x + vx * dt ? vx * decay : 0;
            vy = ny === y + vy * dt ? vy * decay : 0;
            apply({ scale, x: nx, y: ny });
            frame.current = Math.hypot(vx, vy) < minFlingSpeed ? undefined : requestAnimationFrame(step);
        };
        frame.current = requestAnimationFrame(step);
    };

    // The speed of the drag's last moments, nothing when the finger stood still.
    const releaseVelocity = (): Point | null => {
        const now = performance.now();
        const recent = samples.current.filter(sample => now - sample.time <= flingWindow);
        if (recent.length < 2) return null;
        const first = recent[0];
        const last = recent[recent.length - 1];
        const dt = last.time - first.time;
        if (dt <= 0) return null;
        const velocity = { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
        return Math.hypot(velocity.x, velocity.y) < minFlingSpeed ? null : velocity;
    };

    const centre = (): Point => {
        const box = area.current!.getBoundingClientRect();
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    };

    // `from` stays under `to` while the scale goes from `was` to `scale`.
    const zoomed = (was: View, scale: number, from: Point, to: Point): View => {
        const c = centre();
        const qx = (from.x - c.x - was.x) / was.scale;
        const qy = (from.y - c.y - was.y) / was.scale;
        return { scale, x: to.x - c.x - qx * scale, y: to.y - c.y - qy * scale };
    };

    // One finger moves a zoomed element freely, past its edges too, which it
    // springs back from when the finger lifts, so that a drag keeps its momentum.
    // An element at its fitted size stays put; where a pinch left it off centre,
    // it may go back but no further out.
    const panned = (was: View, from: Point, to: Point): View => {
        const x = was.x + to.x - from.x;
        const y = was.y + to.y - from.y;
        if (was.scale > 1) return { scale: was.scale, x, y };
        return {
            scale: was.scale,
            x: clamp(x, -Math.abs(was.x), Math.abs(was.x)),
            y: clamp(y, -Math.abs(was.y), Math.abs(was.y)),
        };
    };

    const rebase = () => {
        const points = [...pointers.current.values()];
        samples.current = [];
        if (!points.length) {
            gesture.current = null;
            return;
        }
        const distance = points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
        gesture.current = { view: current.current, mid: middle(points), distance };
    };

    const onWheel = useEffectEvent((event: WheelEvent) => {
        event.preventDefault();
        stopMotion();
        const was = current.current;
        // A touchpad's pinch comes as the wheel with Ctrl, in finer steps.
        const scale = clamp(
            was.scale * Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002)),
            minGestureScale,
            maxScale,
        );
        const pointer = { x: event.clientX, y: event.clientY };
        apply(zoomed(was, scale, pointer, pointer));
        wheelTimer.current = window.setTimeout(settle, wheelSettleDelay);
    });
    useEffect(() => {
        const element = area.current;
        if (!element) return;
        // Not passive, so that the page does not zoom or scroll instead.
        const listener = (event: WheelEvent) => onWheel(event);
        element.addEventListener('wheel', listener, { passive: false });
        return () => element.removeEventListener('wheel', listener);
    }, []);

    const release = (event: PointerEvent<A>) => {
        if (!pointers.current.has(event.pointerId)) return;
        // Only a drag by one finger flings; a pinch that ends lifts two.
        const velocity = pointers.current.size === 1 ? releaseVelocity() : null;
        pointers.current.delete(event.pointerId);
        rebase();
        if (pointers.current.size) return;
        const view = current.current;
        const inBounds = bounded(view);
        if (inBounds.scale !== view.scale || inBounds.x !== view.x || inBounds.y !== view.y) settle();
        else if (velocity) fling(velocity);
    };

    return {
        area,
        target,
        areaProps: {
            style: { touchAction: 'none' } as CSSProperties,
            onPointerDown(event: PointerEvent<A>) {
                stopMotion();
                if (!pointers.current.size) {
                    dragged.current = false;
                    start.current = { x: event.clientX, y: event.clientY };
                }
                pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                if (pointers.current.size > 1) dragged.current = true;
                rebase();
            },
            onPointerMove(event: PointerEvent<A>) {
                if (!pointers.current.has(event.pointerId) || !gesture.current) return;
                pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                const points = [...pointers.current.values()];
                const { view: was, mid: from, distance } = gesture.current;
                const to = middle(points);
                const spread = points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
                const scale =
                    distance > 0 ? clamp((was.scale * spread) / distance, minGestureScale, maxScale) : was.scale;
                if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > tapSlop)
                    dragged.current = true;
                const next = points.length > 1 ? zoomed(was, scale, from, to) : panned(was, from, to);
                if (points.length === 1) {
                    const now = performance.now();
                    samples.current = [
                        ...samples.current.filter(sample => now - sample.time <= flingWindow),
                        { x: next.x, y: next.y, time: now },
                    ];
                }
                apply(next);
            },
            onPointerUp: release,
            onPointerCancel: release,
        },
        // Whether the press that ends in a click moved or pinched the element,
        // rather than tapped it.
        dragged: () => dragged.current,
    };
}

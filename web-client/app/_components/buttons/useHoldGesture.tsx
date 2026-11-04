'use client';

import { useHold, type HoldAction } from '@/app/_hooks/useHold';
import { anchorName } from '@/app/_utils/anchorName';
import { useId, useRef, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import styles from './Tooltip.module.scss';

const tooltipDelay = 1000;

type Handlers<E extends HTMLElement> = {
    onPointerDown?(event: PointerEvent<E>): void;
    onPointerUp?(event: PointerEvent<E>): void;
    onPointerCancel?(event: PointerEvent<E>): void;
    onPointerLeave?(event: PointerEvent<E>): void;
    onClick?(event: MouseEvent<E>): void;
};

// A press held on an element: for a second, it shows the title over it, as
// native Android does for its buttons; with `hold`, it runs that instead. The
// click that ends a hold is no click: it is stopped before anyone, the element
// included, acts on it. `tooltip` is rendered next to the element, which
// anchors it.
export function useHoldGesture<E extends HTMLElement>(title: string, hold?: HoldAction) {
    const anchor = anchorName('hold', useId());
    const tooltip = useRef<HTMLSpanElement>(null);
    const held = useHold(
        hold?.delay ?? tooltipDelay,
        hold ? hold.action : () => tooltip.current?.showPopover(),
        hold?.repeat,
    );
    const release = (handler: ((event: PointerEvent<E>) => void) | undefined) => (event: PointerEvent<E>) => {
        held.release();
        tooltip.current?.hidePopover();
        handler?.(event);
    };

    return {
        pressed: held.pressed,
        // Joins the element's own anchor names, if any: a menu anchors to the same button.
        style: (style?: CSSProperties): CSSProperties =>
            ({ ...style, anchorName: [style?.anchorName, anchor].filter(Boolean).join(', ') }) as CSSProperties,
        // The element's pointer and click handlers, wrapped around its own.
        handlers: (own: Handlers<E> = {}) => ({
            onPointerDown(event: PointerEvent<E>) {
                held.press(event);
                own.onPointerDown?.(event);
            },
            onPointerUp: release(own.onPointerUp),
            onPointerCancel: release(own.onPointerCancel),
            onPointerLeave: release(own.onPointerLeave),
            onContextMenu(event: MouseEvent<E>) {
                event.preventDefault();
            },
            onClick(event: MouseEvent<E>) {
                if (held.endedHold()) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                own.onClick?.(event);
            },
        }),
        tooltip: hold ? null : (
            <span
                ref={tooltip}
                popover="manual"
                role="tooltip"
                className={styles.tooltip}
                style={{ positionAnchor: anchor } as CSSProperties}
            >
                {title}
            </span>
        ),
    };
}

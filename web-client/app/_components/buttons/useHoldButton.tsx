'use client';

import { useHold, type HoldAction } from '@/app/_hooks/useHold';
import { anchorName } from '@/app/_utils/anchorName';
import {
    useId,
    useRef,
    type ButtonHTMLAttributes,
    type CSSProperties,
    type MouseEvent,
    type PointerEvent,
} from 'react';
import styles from './Tooltip.module.scss';

const tooltipDelay = 1000;

export type HoldButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    title: string;
    // Without it holding shows the title as a tooltip, as native Android does.
    hold?: HoldAction;
};

type PointerHandler = (event: PointerEvent<HTMLButtonElement>) => void;

// Holding the button acts instead of clicking: the click that ends the hold is
// dropped. Gives the button its props and the tooltip to render inside it.
export function useHoldButton({
    hold,
    style,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
    onClick,
    ...rest
}: HoldButtonProps) {
    const anchor = anchorName('button', useId());
    const tooltip = useRef<HTMLSpanElement>(null);
    const held = useHold(
        hold?.delay ?? tooltipDelay,
        hold ? hold.action : () => tooltip.current?.showPopover(),
        hold?.repeat,
    );

    const release = (handler: PointerHandler | undefined) => (event: PointerEvent<HTMLButtonElement>) => {
        held.release();
        tooltip.current?.hidePopover();
        handler?.(event);
    };

    return {
        pressed: held.pressed,
        props: {
            ...rest,
            'aria-label': rest.title,
            // A menu anchors its popover to the same button.
            style: { ...style, anchorName: [style?.anchorName, anchor].filter(Boolean).join(', ') } as CSSProperties,
            onPointerDown(event: PointerEvent<HTMLButtonElement>) {
                held.press(event);
                onPointerDown?.(event);
            },
            onPointerUp: release(onPointerUp),
            onPointerCancel: release(onPointerCancel),
            onPointerLeave: release(onPointerLeave),
            onContextMenu(event: MouseEvent<HTMLButtonElement>) {
                event.preventDefault();
            },
            onClick(event: MouseEvent<HTMLButtonElement>) {
                if (held.endedHold()) {
                    event.preventDefault();
                    return;
                }
                onClick?.(event);
            },
        },
        tooltip: hold ? null : (
            <span
                ref={tooltip}
                popover="manual"
                role="tooltip"
                className={styles.tooltip}
                style={{ positionAnchor: anchor } as CSSProperties}
            >
                {rest.title}
            </span>
        ),
    };
}

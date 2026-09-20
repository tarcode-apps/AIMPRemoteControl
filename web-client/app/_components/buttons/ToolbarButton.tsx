'use client';

import { anchorName } from '@/app/_utils/anchorName';
import clsx from 'clsx';
import { useId, useRef, useState, type CSSProperties } from 'react';
import type { IconButtonProps } from './IconButton';
import styles from './ToolbarButton.module.scss';

const tooltipDelay = 1000;

// Feedback is a ripple, for hovering and pressing alike. Holding the button shows its
// title as a tooltip instead of acting, as native Android does.
export function ToolbarButton({
    title,
    className,
    style,
    children,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
    onClick,
    ...rest
}: IconButtonProps) {
    const anchor = anchorName('toolbar-button', useId());
    const tooltip = useRef<HTMLSpanElement>(null);
    const holdTimer = useRef<number | undefined>(undefined);
    const held = useRef(false);
    const [pressed, setPressed] = useState(false);

    const release = () => {
        window.clearTimeout(holdTimer.current);
        setPressed(false);
        tooltip.current?.hidePopover();
    };

    return (
        <button
            type="button"
            aria-label={title}
            title={title}
            className={clsx(styles.button, pressed && styles.pressed, className)}
            // A menu anchors its popover to the same button.
            style={{ ...style, anchorName: [style?.anchorName, anchor].filter(Boolean).join(', ') } as CSSProperties}
            onPointerDown={event => {
                if (event.button === 0 && !event.currentTarget.disabled) {
                    setPressed(true);
                    held.current = false;
                    holdTimer.current = window.setTimeout(() => {
                        held.current = true;
                        tooltip.current?.showPopover();
                    }, tooltipDelay);
                }
                onPointerDown?.(event);
            }}
            onPointerUp={event => {
                release();
                onPointerUp?.(event);
            }}
            onPointerCancel={event => {
                release();
                onPointerCancel?.(event);
            }}
            onPointerLeave={event => {
                release();
                onPointerLeave?.(event);
            }}
            onContextMenu={event => event.preventDefault()}
            onClick={event => {
                if (held.current) {
                    held.current = false;
                    event.preventDefault();
                    return;
                }
                onClick?.(event);
            }}
            {...rest}
        >
            <span className={styles.ripple} />
            {children}
            <span
                ref={tooltip}
                popover="manual"
                role="tooltip"
                className={styles.tooltip}
                style={{ positionAnchor: anchor } as CSSProperties}
            >
                {title}
            </span>
        </button>
    );
}

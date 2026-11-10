'use client';

import type { HoldAction } from '@/app/_hooks/useHold';
import type { ButtonHTMLAttributes } from 'react';
import { useHoldGesture } from './useHoldGesture';

export type HoldButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    title: string;
    // Without it holding shows the title as a tooltip, as native Android does.
    hold?: HoldAction;
};

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
    const held = useHoldGesture<HTMLButtonElement>(rest.title, hold);
    return {
        pressed: held.pressed,
        props: {
            ...rest,
            'aria-label': rest.title,
            style: held.style(style),
            ...held.handlers({ onPointerDown, onPointerUp, onPointerCancel, onPointerLeave, onClick }),
        },
        tooltip: held.tooltip,
    };
}

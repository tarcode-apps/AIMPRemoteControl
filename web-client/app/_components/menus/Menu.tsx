'use client';

import { anchorName } from '@/app/_utils/anchorName';
import {
    useEffect,
    useId,
    useRef,
    useState,
    type ComponentType,
    type CSSProperties,
    type KeyboardEvent,
    type ToggleEvent,
} from 'react';
import { IconButton, type IconButtonProps } from '../buttons';
import { Icon } from '../icons';
import styles from './Menu.module.scss';

export type MenuItem = {
    label: string;
    icon?: string;
    disabled?: boolean;
    onSelect(): void;
};

export type MenuPopoverProps = {
    id: string;
    // The CSS anchor name of the element the menu opens at.
    anchor?: string;
    items: MenuItem[];
    onClose?(): void;
};

// The popover of a menu, shown by any button with `popoverTarget={id}`.
export function MenuPopover({ id, anchor, items, onClose }: MenuPopoverProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);

    // A click outside only closes the menu: the browser dismisses the popover on
    // the pointer going down and would still deliver the click to whatever is
    // underneath, such as a row that plays its track. The menu's own buttons are
    // left alone, so that they keep working.
    useEffect(() => {
        const menu = ref.current;
        if (!open || !menu) return;
        let dismissing = false;
        const outside = (target: EventTarget | null) =>
            !(target instanceof Node && menu.contains(target)) &&
            !(target instanceof Element && target.closest(`[popovertarget="${CSS.escape(id)}"]`));
        const onPointerDown = (event: PointerEvent) => {
            dismissing = outside(event.target);
        };
        const onClick = (event: MouseEvent) => {
            if (dismissing) {
                event.stopPropagation();
                event.preventDefault();
            }
            dismissing = false;
        };
        window.addEventListener('pointerdown', onPointerDown, true);
        window.addEventListener('click', onClick, true);
        return () => {
            window.removeEventListener('pointerdown', onPointerDown, true);
            window.removeEventListener('click', onClick, true);
        };
    }, [open, id]);

    // The items are always mounted, so autoFocus would not fire when the popover opens.
    const onToggle = (event: ToggleEvent<HTMLDivElement>) => {
        const opened = event.newState === 'open';
        setOpen(opened);
        if (opened) event.currentTarget.querySelector<HTMLButtonElement>('[role=menuitem]:enabled')?.focus();
        else onClose?.();
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const menu = event.currentTarget;
        const enabled = [...menu.querySelectorAll<HTMLButtonElement>('[role=menuitem]:enabled')];
        const current = enabled.indexOf(document.activeElement as HTMLButtonElement);
        const focus = (index: number) => enabled.at(index % enabled.length)?.focus();
        switch (event.key) {
            case 'ArrowDown':
                focus(current + 1);
                break;
            case 'ArrowUp':
                focus(current - 1 + enabled.length);
                break;
            case 'Home':
                focus(0);
                break;
            case 'End':
                focus(-1);
                break;
            case 'Tab':
                menu.hidePopover();
                return;
            default:
                return;
        }
        event.preventDefault();
    };

    return (
        <div
            ref={ref}
            id={id}
            popover="auto"
            role="menu"
            className={styles.menu}
            style={{ positionAnchor: anchor } as CSSProperties}
            onKeyDown={onKeyDown}
            onToggle={onToggle}
        >
            {items.map(item => (
                <button
                    key={item.label}
                    role="menuitem"
                    className={styles.item}
                    disabled={item.disabled}
                    // Hidden by hand before the action: an action that re-renders the
                    // items takes the clicked button out of the DOM before a declarative
                    // hide could run.
                    onClick={event => {
                        event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover();
                        item.onSelect();
                    }}
                >
                    {item.icon && <Icon>{item.icon}</Icon>}
                    <span>{item.label}</span>
                </button>
            ))}
        </div>
    );
}

export type MenuProps = {
    title: string;
    icon: string;
    items: MenuItem[];
    className?: string;
    Button?: ComponentType<IconButtonProps>;
};

export function Menu({ title, icon, items, className, Button = IconButton }: MenuProps) {
    const id = useId();
    const anchor = anchorName('menu', id);

    return (
        <div className={className}>
            <Button
                title={title}
                aria-haspopup="menu"
                popoverTarget={id}
                style={{ anchorName: anchor } as CSSProperties}
            >
                <Icon>{icon}</Icon>
            </Button>
            <MenuPopover id={id} anchor={anchor} items={items} />
        </div>
    );
}

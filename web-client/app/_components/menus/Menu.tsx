'use client';

import { anchorName } from '@/app/_utils/anchorName';
import { useId, type ComponentType, type CSSProperties, type KeyboardEvent, type ToggleEvent } from 'react';
import { IconButton, type IconButtonProps } from '../buttons';
import { Icon } from '../icons';
import styles from './Menu.module.scss';

export type MenuItem = {
    label: string;
    icon?: string;
    disabled?: boolean;
    onSelect(): void;
};

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

    // The items are always mounted, so autoFocus would not fire when the popover opens.
    const onToggle = (event: ToggleEvent<HTMLDivElement>) => {
        if (event.newState === 'open')
            event.currentTarget.querySelector<HTMLButtonElement>('[role=menuitem]:enabled')?.focus();
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
        <div className={className}>
            <Button
                title={title}
                aria-haspopup="menu"
                popoverTarget={id}
                style={{ anchorName: anchor } as CSSProperties}
            >
                <Icon>{icon}</Icon>
            </Button>
            <div
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
                        popoverTarget={id}
                        popoverTargetAction="hide"
                        onClick={item.onSelect}
                    >
                        {item.icon && <Icon>{item.icon}</Icon>}
                        <span>{item.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

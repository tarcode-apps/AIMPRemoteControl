import clsx from 'clsx';
import type { CSSProperties, HTMLAttributes } from 'react';
import styles from './Skeleton.module.scss';

export type SkeletonProps = HTMLAttributes<HTMLSpanElement> & {
    width?: CSSProperties['width'];
    height?: CSSProperties['height'];
    shape?: 'text' | 'circle' | 'rect';
};

export function Skeleton({ width, height, shape = 'text', className, style, ...rest }: SkeletonProps) {
    return (
        <span
            aria-hidden="true"
            className={clsx(styles.skeleton, styles[shape], className)}
            style={{ width, height, ...style }}
            {...rest}
        />
    );
}

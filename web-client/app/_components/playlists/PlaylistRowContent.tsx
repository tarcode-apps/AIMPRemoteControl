'use client';

import type { Playlist, PlaylistGroup, PlaylistItem } from '@/app/_api/types';
import { formatDuration } from '@/app/_utils/format';
import { useTranslation } from 'react-i18next';
import { Icon } from '../icons';
import { Checkbox } from '../inputs';
import { Skeleton } from '../skeleton';
import styles from './PlaylistPage.module.scss';

export type RowProps = {
    playlist: Playlist;
    docked: boolean;
    // The widest number on screen, which every number cell renders invisibly to
    // size itself by: the rows are positioned absolutely and share no grid.
    widestNumber: string;
    selecting: boolean;
};

export type ItemRowProps = RowProps & {
    item: PlaylistItem;
    number: number;
    selected: boolean;
    onSelect(selected: boolean): void;
};

export function ItemRow({ item, number, playlist, docked, widestNumber, selecting, selected, onSelect }: ItemRowProps) {
    const { t } = useTranslation();
    const label = playlist.showNumbers && `${number}.`;
    return (
        <>
            {selecting && (
                <Checkbox
                    title={t('playlist.selectItem')}
                    tabIndex={-1}
                    className={styles.checkbox}
                    checked={selected}
                    onChange={event => onSelect(event.target.checked)}
                    onClick={event => event.stopPropagation()}
                />
            )}
            {label && docked && (
                <div className={styles.number} data-widest={widestNumber}>
                    {label}
                </div>
            )}
            <div className={styles.text}>
                <div className={styles.title}>
                    {label && !docked && `${label} `}
                    {item.displayText}
                </div>
                {playlist.showSecondLine && <div className={styles.details}>{item.secondLine}</div>}
            </div>
            {playlist.showDuration && <div className={styles.duration}>{formatDuration(item.duration)}</div>}
        </>
    );
}

export function SkeletonRow({ playlist, docked, widestNumber, selecting }: RowProps) {
    return (
        <>
            {selecting && <Skeleton shape="rect" className={styles.checkbox} width={16} height={16} />}
            {playlist.showNumbers && docked && (
                <div className={styles.number} data-widest={widestNumber}>
                    <Skeleton width="100%" />
                </div>
            )}
            <div className={styles.text}>
                <Skeleton className={styles.title} width="60%" />
                {playlist.showSecondLine && <Skeleton className={styles.details} width="40%" />}
            </div>
            {playlist.showDuration && <Skeleton className={styles.duration} width="2.5em" />}
        </>
    );
}

export function GroupRow({ group, onToggle }: { group: PlaylistGroup; onToggle?(): void }) {
    const { t } = useTranslation();
    if (!onToggle)
        return (
            <div className={styles.groupButton}>
                <div className={styles.groupName}>{group.name}</div>
                <div className={styles.groupCount}>{group.count}</div>
            </div>
        );
    return (
        <button
            type="button"
            className={styles.groupButton}
            aria-expanded={group.expanded}
            tabIndex={-1}
            title={t(group.expanded ? 'playlist.collapseGroup' : 'playlist.expandGroup')}
            onClick={onToggle}
        >
            <div className={styles.groupName}>{group.name}</div>
            <div className={styles.groupCount}>{group.count}</div>
            <Icon className={styles.groupChevron}>{group.expanded ? 'expand_less' : 'expand_more'}</Icon>
        </button>
    );
}

'use client';

import { itemCoverUrl } from '@/app/_api/covers';
import { ApiError, errorMessage } from '@/app/_api/helpers/errors';
import { useLyrics, useTrackInfo } from '@/app/_api/playlists';
import type { Lyrics, TrackInfo } from '@/app/_api/types';
import { ToolbarButton, useHoldGesture } from '@/app/_components/buttons';
import { ItemCover } from '@/app/_components/cover';
import { Icon } from '@/app/_components/icons';
import { Screen } from '@/app/_components/pages';
import { useToast } from '@/app/_components/toast';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { media } from '@/app/_styles/media';
import { formatKilobytes, formatPreciseDuration } from '@/app/_utils/format';
import clsx from 'clsx';
import type { TFunction } from 'i18next';
import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CoverViewer } from './CoverViewer';
import styles from './TrackInfo.module.scss';

type Page = 'tags' | 'lyrics';

type FieldKey =
    | 'duration'
    | 'stream'
    | 'size'
    | 'format'
    | 'playCount'
    | 'lastPlayed'
    | 'title'
    | 'artist'
    | 'album'
    | 'albumArtist'
    | 'genre'
    | 'year'
    | 'trackNumber'
    | 'lyricist'
    | 'lyrics'
    | 'file';

// One line of the information: what it is and its value, empty when not set
// and undefined while it is still being looked for.
type Line = {
    key: FieldKey;
    value: string | undefined;
    icon?: string;
    multiline?: boolean;
};

// "48 kHz, 1704 kbps, 24 bit, Stereo", as the player puts it in every language;
// what the player does not know is left out.
function streamLine(info: TrackInfo): string {
    const parts: string[] = [];
    if (info.sampleRate) parts.push(`${Math.round(info.sampleRate / 1000)} kHz`);
    if (info.bitrate) parts.push(`${info.bitrate} kbps`);
    if (info.bitDepth) parts.push(`${info.bitDepth} bit`);
    if (info.channels === 1) parts.push('Mono');
    else if (info.channels === 2) parts.push('Stereo');
    else if (info.channels) parts.push(`${info.channels} ch`);
    return parts.join(', ');
}

function summaryLines(info: TrackInfo, t: TFunction, locale: string): Line[] {
    const lastPlayed = info.lastPlayed
        ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(info.lastPlayed))
        : t('trackInfo.neverPlayed');
    return [
        { key: 'duration', value: formatPreciseDuration(info.duration) },
        { key: 'stream', value: streamLine(info) },
        { key: 'size', value: info.size ? formatKilobytes(info.size, locale) : '' },
        { key: 'format', value: info.format },
        { key: 'playCount', value: String(info.playCount) },
        { key: 'lastPlayed', value: lastPlayed },
    ];
}

function tagLines(info: TrackInfo): Line[] {
    return [
        { key: 'title', value: info.title, icon: 'music_note' },
        { key: 'artist', value: info.artist, icon: 'person' },
        { key: 'album', value: info.album, icon: 'album' },
        { key: 'albumArtist', value: info.albumArtist, icon: 'group' },
        { key: 'genre', value: info.genre, icon: 'piano' },
        { key: 'year', value: info.year, icon: 'calendar_month' },
        { key: 'trackNumber', value: info.trackNumber, icon: 'tag' },
    ];
}

// The lyrics as the player finds them, in the tag or the files beside the
// track, as plain lines; undefined while they are being looked for.
function lyricsLines(info: TrackInfo, lyrics: string | undefined): Line[] {
    return [
        { key: 'lyricist', value: info.lyricist, icon: 'person_edit' },
        { key: 'lyrics', value: lyrics, icon: 'article', multiline: true },
    ];
}

const lyricsText = (lyrics: Lyrics) => lyrics.lines.map(line => line.text).join('\n');

// Everything the screen shows as text, a line per field, the lyrics last.
function informationText(info: TrackInfo, lyrics: string | undefined, t: TFunction, locale: string): string {
    const label = (line: Line) => t(`trackInfo.fields.${line.key}`);
    const all = [...summaryLines(info, t, locale), ...tagLines(info), ...lyricsLines(info, lyrics)];
    const lines = all.filter(line => line.value && !line.multiline).map(line => `${label(line)}: ${line.value}`);
    lines.push(`${t('trackInfo.fields.file')}: ${info.fileUri}`);
    for (const line of all) if (line.multiline && line.value) lines.push('', `${label(line)}:`, line.value);
    return lines.join('\n');
}

// The clipboard API needs a secure context, which a player reached by its
// address on the network is not; the old command works there.
async function copyText(text: string): Promise<boolean> {
    if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        return true;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.className = styles.copyArea;
    document.body.append(area);
    area.select();
    try {
        return document.execCommand('copy');
    } finally {
        area.remove();
    }
}

// The cover as found in the tags or the folder, under the name saving it offers:
// the album, or the track, as the user would name the file.
function originalCoverUrl(info: TrackInfo): string {
    const name =
        [info.albumArtist || info.artist, info.album].filter(Boolean).join(' - ') ||
        info.title ||
        info.fileName.replace(/\.[^.]*$/, '');
    return itemCoverUrl(info.playlistId, info.index, info.cover, 'original', name);
}

type InfoLineProps = {
    line: Line;
    // The label stands beside the value; otherwise a hold on the value shows it.
    labelled: boolean;
    onCopy(text: string): void;
    className?: string;
};

// A click on the value copies it.
function InfoLine({ line, labelled, onCopy, className }: InfoLineProps) {
    const { t } = useTranslation();
    const label = t(`trackInfo.fields.${line.key}`);
    const hold = useHoldGesture<HTMLButtonElement>(label);
    const copy = () => {
        if (line.value) onCopy(line.value);
    };
    return (
        <div className={clsx(styles.line, className)} data-testid="track-info-line">
            {line.icon && <Icon className={styles.icon}>{line.icon}</Icon>}
            <dt className={clsx(styles.label, !labelled && styles.heldLabel)}>{label}</dt>
            <dd className={clsx(styles.value, line.value === '' && styles.empty, line.multiline && styles.multiline)}>
                <button
                    type="button"
                    className={styles.valueButton}
                    title={labelled && line.value ? t('trackInfo.copyValue') : undefined}
                    style={labelled ? undefined : hold.style()}
                    {...(labelled ? { onClick: copy } : hold.handlers({ onClick: copy }))}
                >
                    {line.value ?? '\u00A0'}
                    {line.value === '' && t('trackInfo.notSet')}
                </button>
            </dd>
            {!labelled && hold.tooltip}
        </div>
    );
}

export function TrackInfoScreen() {
    const { t, i18n } = useTranslation();
    const params = useSearchParams();
    const playlistId = params.get('playlist') ?? '';
    const fileUri = params.get('uri') ?? '';
    const { data: info, error } = useTrackInfo(playlistId, fileUri);
    // Looked for with the information, as the player's own screen does, so that
    // the copy has them too; the request fails like the information's when the
    // track is gone, which the notice already says.
    const { data: lyricsFound, error: lyricsError } = useLyrics(playlistId, fileUri, true);
    const foundText = lyricsFound && lyricsText(lyricsFound);
    const lyricsValue = foundText ?? (lyricsError ? errorMessage(lyricsError, t) : undefined);
    const docked = useMediaQuery(media.drawerDocked);
    const [page, setPage] = useState<Page>('tags');
    const toast = useToast();
    const [hasCover, setHasCover] = useState(false);
    const [viewing, setViewing] = useState(false);
    const coverButton = useRef<HTMLButtonElement>(null);

    const gone = error instanceof ApiError && error.code === 'itemNotFound';
    const copy = async (text: string) => {
        const done = await copyText(text).catch(() => false);
        toast.show(t(done ? 'trackInfo.copied' : 'trackInfo.copyFailed'));
    };
    const copyAll = () => {
        if (info) void copy(informationText(info, foundText, t, i18n.language));
    };

    const toolbar = (
        <div className={styles.toolbar}>
            <ToolbarButton
                title={t(page === 'tags' ? 'trackInfo.showLyrics' : 'trackInfo.showTags')}
                disabled={!info}
                onClick={() => setPage(page === 'tags' ? 'lyrics' : 'tags')}
            >
                <Icon>{page === 'tags' ? 'article' : 'list_alt'}</Icon>
            </ToolbarButton>
            <ToolbarButton title={t('trackInfo.copy')} className={styles.copy} disabled={!info} onClick={copyAll}>
                <Icon>content_copy</Icon>
            </ToolbarButton>
        </div>
    );
    return (
        <Screen
            title={t('trackInfo.title')}
            subtitle={info?.fileName}
            notice={gone ? t('trackInfo.gone') : undefined}
            toolbar={toolbar}
        >
            <CoverViewer
                src={info && viewing ? originalCoverUrl(info) : null}
                label={t('trackInfo.cover')}
                origin={() => coverButton.current?.getBoundingClientRect()}
                onClose={() => setViewing(false)}
            />
            {info ? (
                <div className={styles.page}>
                    <section className={styles.summary}>
                        {/* A button whether or not there is a cover, so that the image
                            does not load again when it turns out there is one. */}
                        <button
                            ref={coverButton}
                            type="button"
                            className={styles.coverButton}
                            title={t('trackInfo.cover')}
                            aria-haspopup="dialog"
                            disabled={!hasCover}
                            onClick={() => setViewing(true)}
                        >
                            <ItemCover
                                playlistId={info.playlistId}
                                index={info.index}
                                coverKey={info.cover}
                                revision={info.revision}
                                size={docked ? 160 : 128}
                                className={styles.cover}
                                onLoaded={setHasCover}
                            />
                        </button>
                        <dl className={styles.summaryLines}>
                            {summaryLines(info, t, i18n.language).map(line => (
                                <InfoLine
                                    key={line.key}
                                    line={line}
                                    labelled={docked}
                                    onCopy={copy}
                                    className={clsx(
                                        line.key === 'duration' && styles.duration,
                                        line.key === 'playCount' && styles.statistics,
                                    )}
                                />
                            ))}
                        </dl>
                    </section>
                    <dl className={styles.fields}>
                        {(page === 'tags' ? tagLines(info) : lyricsLines(info, lyricsValue)).map(line => (
                            <InfoLine key={line.key} line={line} labelled={docked} onCopy={copy} />
                        ))}
                    </dl>
                    {page === 'tags' && (
                        <dl className={clsx(styles.fields, styles.fileSection)}>
                            <InfoLine
                                // On a mobile the path alone, its icon gone with the label.
                                line={{ key: 'file', value: info.fileUri, icon: docked ? 'draft' : undefined }}
                                labelled={docked}
                                onCopy={copy}
                                className={styles.file}
                            />
                        </dl>
                    )}
                </div>
            ) : (
                error && !gone && <p className={styles.message}>{errorMessage(error, t)}</p>
            )}
        </Screen>
    );
}

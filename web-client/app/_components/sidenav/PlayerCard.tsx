'use client';

import { useAbout, type About } from '@/app/_api/about';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextButton } from '../buttons';
import { Dialog } from '../dialogs';
import styles from './PlayerCard.module.scss';

const sourceUrl = 'https://github.com/tarcode-apps/AIMPRemoteControl';
// The build writes it beside the bundles whose licenses it collects.
const licensesUrl = '/_next/static/third-party-licenses.txt';

// The player under control, at the top of the sidebar; it opens what is known of it.
export function PlayerCard() {
    const { t } = useTranslation();
    const about = useAbout();
    const [open, setOpen] = useState(false);

    return (
        <div className={styles.header} data-row>
            <button type="button" className={styles.card} disabled={!about} onClick={() => setOpen(true)}>
                <LogoIcon />
                <span className={styles.text}>
                    <span className={styles.name}>{about?.name || t('app.name')}</span>
                    {about && <span className={styles.details}>AIMP {about.aimpVersion}</span>}
                </span>
            </button>
            {open && about && <AboutDialog about={about} onClose={() => setOpen(false)} />}
        </div>
    );
}

// The logo of public/logo.svg in one colour, the size of an icon: its play sign
// and waves cut out of the disc, as the filled icons of the rows below draw.
function LogoIcon() {
    const mask = useId();
    return (
        <svg className={styles.logo} viewBox="-16 -16 288 288" aria-hidden="true">
            <mask id={mask}>
                <rect x="-16" y="-16" width="288" height="288" fill="white" />
                <path d="M74,90 L132,128 L74,166 Z" stroke="black" strokeWidth="14" strokeLinejoin="round" />
                <g fill="none" stroke="black" strokeWidth="20" strokeLinecap="round">
                    <path d="M163,96 A 45 45 0 0 1 163,160" />
                    <path d="M182,77 A 72 72 0 0 1 182,179" />
                </g>
            </mask>
            <circle cx="128" cy="128" r="128" fill="currentColor" mask={`url(#${mask})`} />
        </svg>
    );
}

function AboutDialog({ about, onClose }: { about: About; onClose(): void }) {
    const { t } = useTranslation();
    return (
        <Dialog
            open
            compact
            title={about.name || t('app.name')}
            onClose={onClose}
            actions={<TextButton onClick={onClose}>{t('actions.close')}</TextButton>}
        >
            <dl className={styles.facts}>
                <dt>{t('about.address')}</dt>
                <dd>{location.host}</dd>
                <dt>AIMP</dt>
                <dd>{about.aimpVersion}</dd>
                <dt>{t('about.plugin')}</dt>
                <dd>{about.pluginVersion}</dd>
            </dl>
            <p className={styles.links}>
                <a href={sourceUrl} target="_blank" rel="noreferrer">
                    {t('about.source')}
                </a>
                <a href={licensesUrl} target="_blank">
                    {t('about.licenses')}
                </a>
            </p>
        </Dialog>
    );
}

'use client';

import { retryConnection, useConnection } from '@/app/_api/helpers/connection';
import clsx from 'clsx';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../buttons';
import { Icon } from '../icons';
import styles from './ConnectionBanner.module.scss';

const restoredTime = 1500;

function subscribeDevice(listener: () => void) {
    window.addEventListener('online', listener);
    window.addEventListener('offline', listener);
    return () => {
        window.removeEventListener('online', listener);
        window.removeEventListener('offline', listener);
    };
}

// False only for a device with no network at all; true says nothing of the
// player, so it only words the banner.
function useDeviceOnline() {
    return useSyncExternalStore(
        subscribeDevice,
        () => navigator.onLine,
        () => true,
    );
}

// Keyed by `at`, so that its clock starts with each new wait.
function Countdown({ at }: { at: number }) {
    const { t } = useTranslation();
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 250);
        return () => window.clearInterval(timer);
    }, []);
    return t('connection.retryIn', { seconds: Math.max(1, Math.ceil((at - now) / 1000)) });
}

// At the top of every screen while the player is out of reach, and a moment
// after it is back. The root takes its height into --safe-top, so all that
// stands at the top moves down to make room.
export function ConnectionBanner() {
    const { t } = useTranslation();
    const { online, closed, retryAt, flashes } = useConnection();
    const deviceOnline = useDeviceOnline();
    const [seenOnline, setSeenOnline] = useState(online);
    const [restored, setRestored] = useState(false);
    if (online !== seenOnline) {
        setSeenOnline(online);
        setRestored(online);
    }
    useEffect(() => {
        if (!restored) return;
        const timer = window.setTimeout(() => setRestored(false), restoredTime);
        return () => window.clearTimeout(timer);
    }, [restored]);

    const shown = !online || restored;
    useEffect(() => {
        document.documentElement.classList.toggle('has-connection-banner', shown);
    }, [shown]);

    const [text, icon] = online
        ? (['restored', 'check_circle'] as const)
        : !deviceOnline
          ? (['deviceOffline', 'wifi_off'] as const)
          : closed
            ? (['closed', 'power_settings_new'] as const)
            : (['lost', 'cloud_off'] as const);

    return (
        <div className={styles.banner} aria-hidden={!shown} inert={!shown} data-testid="connection-banner">
            {/* Mounted anew with each flash, which plays its animation again. */}
            <div key={flashes} className={clsx(styles.content, flashes > 0 && styles.flash)}>
                <Icon className={styles.icon}>{icon}</Icon>
                <div className={styles.text}>
                    <span role="status" className={styles.title}>
                        {t(`connection.${text}`)}
                    </span>
                    {!online && (
                        <span className={styles.details}>
                            {retryAt === null ? t('connection.connecting') : <Countdown key={retryAt} at={retryAt} />}
                        </span>
                    )}
                </div>
                {!online && (
                    <IconButton title={t('connection.retry')} disabled={retryAt === null} onClick={retryConnection}>
                        <Icon>refresh</Icon>
                    </IconButton>
                )}
            </div>
        </div>
    );
}

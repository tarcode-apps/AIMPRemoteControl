'use client';

import { errorMessage } from '@/app/_api/helpers/errors';
import { IconButton } from '@/app/_components/buttons';
import { Icon } from '@/app/_components/icons';
import { Screen } from '@/app/_components/pages';
import screenStyles from '@/app/_components/pages/Screen.module.scss';
import { useMediaQuery } from '@/app/_hooks/useMediaQuery';
import { media } from '@/app/_styles/media';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { FilesList } from './_components/FilesList';
import { FilesModeProvider, useFilesMode } from './_components/FilesMode';
import { FilesToolbar } from './_components/FilesToolbar';

// The target playlist and the kind of files come from the address, which the
// static export only knows on the client.
export default function Files() {
    return (
        <Suspense>
            <FilesModeProvider>
                <FilesScreen />
            </FilesModeProvider>
        </Suspense>
    );
}

// The last part of a path, whichever way its separators go.
function folderName(path: string) {
    return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function FilesScreen() {
    const { t } = useTranslation();
    const mode = useFilesMode();
    const docked = useMediaQuery(media.drawerDocked);
    const inFolder = mode.path !== '';

    // Inside a folder the arrow leads up, and the roots are one tap away. A
    // docked drawer has no arrow in the app bar, so there the way up sits with it.
    return (
        <Screen
            title={
                inFolder ? folderName(mode.path) : t(mode.type === 'playlist' ? 'files.playlists' : 'files.computer')
            }
            subtitle={mode.path || (mode.playlist && t('files.addingTo', { name: mode.playlist.name }))}
            onBack={inFolder ? mode.up : undefined}
            backIcon={inFolder ? 'arrow_upward' : undefined}
            backTitle={inFolder ? t('files.up') : undefined}
            actions={
                inFolder && (
                    <>
                        {docked && (
                            <IconButton title={t('files.up')} onClick={mode.up}>
                                <Icon>arrow_upward</Icon>
                            </IconButton>
                        )}
                        <IconButton title={t('files.home')} onClick={mode.home}>
                            <Icon>home</Icon>
                        </IconButton>
                    </>
                )
            }
            notice={
                mode.addError && (
                    <>
                        <Icon className={screenStyles.noticeIcon}>error</Icon>
                        <span className={screenStyles.noticeText}>{errorMessage(mode.addError, t)}</span>
                    </>
                )
            }
            toolbar={<FilesToolbar />}
        >
            <FilesList />
        </Screen>
    );
}

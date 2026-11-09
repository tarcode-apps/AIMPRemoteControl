import type { Viewport } from 'next';
import { ApiProvider } from './_api/helpers/ApiProvider';
import { ConnectionBanner } from './_components/connection';
import { PlayerPanel, PlayerPanelProvider } from './_components/player';
import { Drawer, DrawerContainer, DrawerContent, Sidebar } from './_components/sidenav';
import { DocumentTitle } from './_components/title';
import { ToastProvider } from './_components/toast';
import { DetectLanguage } from './_i18n/DetectLanguage';
import { fallbackLanguage } from './_i18n/resources';
import { FileDragProvider } from './_state/FileDrag';
import { NavigationProvider } from './_state/Navigation';
import { PlaylistSelectionProvider } from './_state/PlaylistSelection';
import { UploadsProvider } from './_state/Uploads';
import './_styles/globals.scss';

// The title is the DocumentTitle component's: it names the player.
export const viewport: Viewport = {
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#ffffff' },
        { media: '(prefers-color-scheme: dark)', color: '#202125' },
    ],
    viewportFit: 'cover',
    // The on-screen keyboard shrinks the layout, so the toolbar rises above it
    // instead of being covered.
    interactiveWidget: 'resizes-content',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang={fallbackLanguage}>
            <body>
                <DetectLanguage />
                <DocumentTitle />
                <ApiProvider>
                    <ConnectionBanner />
                    <ToastProvider>
                        <NavigationProvider>
                            <PlaylistSelectionProvider>
                                <UploadsProvider>
                                    <FileDragProvider>
                                        <PlayerPanelProvider>
                                            <DrawerContainer>
                                                <Drawer>
                                                    <Sidebar />
                                                </Drawer>
                                                <DrawerContent>{children}</DrawerContent>
                                                <PlayerPanel />
                                            </DrawerContainer>
                                        </PlayerPanelProvider>
                                    </FileDragProvider>
                                </UploadsProvider>
                            </PlaylistSelectionProvider>
                        </NavigationProvider>
                    </ToastProvider>
                </ApiProvider>
            </body>
        </html>
    );
}

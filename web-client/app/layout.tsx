import type { Metadata, Viewport } from 'next';
import { ApiProvider } from './_api/helpers/ApiProvider';
import { Drawer, DrawerContainer, DrawerContent, PlayerPanel, PlayerPanelProvider, Sidebar } from './_components';
import { DetectLanguage } from './_i18n/DetectLanguage';
import { fallbackLanguage, resources } from './_i18n/resources';
import { NavigationProvider } from './_state/Navigation';
import { PlaylistSelectionProvider } from './_state/PlaylistSelection';
import './_styles/globals.scss';

export const metadata: Metadata = {
    title: resources[fallbackLanguage].translation.app.name,
};

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
                <ApiProvider>
                    <NavigationProvider>
                        <PlaylistSelectionProvider>
                            <PlayerPanelProvider>
                                <DrawerContainer>
                                    <Drawer>
                                        <Sidebar />
                                    </Drawer>
                                    <DrawerContent>{children}</DrawerContent>
                                    <PlayerPanel />
                                </DrawerContainer>
                            </PlayerPanelProvider>
                        </PlaylistSelectionProvider>
                    </NavigationProvider>
                </ApiProvider>
            </body>
        </html>
    );
}

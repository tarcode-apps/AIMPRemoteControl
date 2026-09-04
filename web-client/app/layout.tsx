import type { Metadata, Viewport } from 'next';
import { ApiProvider } from './_api/ApiProvider';
import {
    Drawer,
    DrawerContainer,
    DrawerContent,
    PlayerPanel,
    PlayerPanelProvider,
    PlaylistSelectionProvider,
    Sidebar,
} from './_components';
import { DetectLanguage } from './_i18n/DetectLanguage';
import { fallbackLanguage, resources } from './_i18n/resources';
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
                </ApiProvider>
            </body>
        </html>
    );
}

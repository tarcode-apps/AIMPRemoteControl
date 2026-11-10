import { expect, test } from './fixtures';
import { PlaylistScreen } from './pages/playlist-screen';
import { t } from './strings';

// The playlists themselves, as the drawer manages them.
test.describe('playlists', () => {
    test('text in the search puts the clear button where the create button was', async ({ app, playlists }) => {
        const playlist = await playlists.create();
        await new PlaylistScreen(app, playlist.name).open();
        await app.openDrawer();
        const create = app.navigation.getByRole('button', { name: t('playlists.create') });
        const clear = app.navigation.getByRole('button', { name: t('playlist.closeSearch') });
        const search = app.drawer.getByPlaceholder(t('playlists.searchPlaceholder'));
        await expect(create).toBeVisible();
        await expect(clear).toHaveCount(0);
        await search.fill(playlist.name);
        await expect(create).toHaveCount(0);
        // The one takes the other's place exactly, measured once the drawer's slide is over.
        await app.drawer.evaluate(drawer => Promise.all(drawer.getAnimations().map(animation => animation.finished)));
        const box = await clear.boundingBox();
        await search.fill('');
        expect(await create.boundingBox()).toEqual(box);
        await search.fill(playlist.name);
        await clear.click();
        await expect(search).toHaveValue('');
        await expect(create).toBeVisible();
    });

    test('a new playlist is created, renamed and deleted', async ({ api, app, playlists }, testInfo) => {
        const name = `rc-e2e new ${testInfo.project.name}`;
        const renamed = `${name} renamed`;
        playlists.adopt(name);
        playlists.adopt(renamed);
        const existing = await playlists.create();
        await new PlaylistScreen(app, existing.name).open();

        await app.openDrawer();
        await app.navigation.getByRole('button', { name: t('playlists.create') }).click();
        await expect(app.dialog).toContainText(t('playlists.name'));
        await app.dialog.getByRole('textbox').fill(name);
        await app.dialogButton(t('actions.ok')).click();
        await expect(app.dialog).toBeHidden();
        await expect.poll(async () => (await api.playlists()).some(p => p.name === name)).toBe(true);
        const created = new PlaylistScreen(app, name);
        await expect(app.drawerDocked ? app.heading : created.tab).toHaveText(name);

        await app.openDrawer();
        await app.chooseFromMenu(app.playlistMenuButton(name), t('playlists.rename'));
        await expect(app.dialogButton(t('actions.ok'))).toBeDisabled();
        await app.dialog.getByRole('textbox').fill(renamed);
        await app.dialogButton(t('actions.ok')).click();
        await expect.poll(async () => (await api.playlists()).some(p => p.name === renamed)).toBe(true);

        await app.openDrawer();
        await app.chooseFromMenu(app.playlistMenuButton(renamed), t('playlists.remove'));
        await expect(app.dialog).toContainText(t('playlists.removeConfirm', { name: renamed }));
        await app.dialogButton(t('actions.delete')).click();
        await expect.poll(async () => (await api.playlists()).some(p => p.name === renamed)).toBe(false);
        await expect(app.playlistLink(renamed)).toHaveCount(0);
    });

    test('the More menu renames the playlist on screen', async ({ api, app, playlists }) => {
        const playlist = await playlists.create();
        const screen = new PlaylistScreen(app, playlist.name);
        await screen.open();
        const renamed = `${playlist.name} 2`;
        await screen.more(t('playlists.rename'));
        await app.dialog.getByRole('textbox').fill(renamed);
        await app.dialogButton(t('actions.ok')).click();
        await expect.poll(async () => (await api.playlist(playlist.id))?.name).toBe(renamed);
    });

    test('the drawer finds a playlist by name and opens it', async ({ app, playlists }) => {
        const first = await playlists.create({ name: 'rc-e2e Kestrel', tracks: [{ title: 'Kestrel song' }] });
        const second = await playlists.create({ name: 'rc-e2e Osprey', tracks: [{ title: 'Osprey song' }] });
        await new PlaylistScreen(app, first.name).open();

        await app.openDrawer();
        const filter = app.navigation.getByRole('searchbox');
        await filter.fill('ospr');
        await expect(app.playlistLink(second.name)).toBeVisible();
        await expect(app.playlistLink(first.name)).toBeHidden();
        await filter.press('Enter');
        const screen = new PlaylistScreen(app, second.name);
        await expect(screen.row('Osprey song')).toBeInViewport();

        await app.openDrawer();
        await filter.fill('no such playlist');
        await expect(app.navigation.getByText(t('playlists.notFound'))).toBeVisible();
    });

    test('switching playlists shows their tracks', async ({ app, playlists }) => {
        const first = await playlists.create({ name: 'rc-e2e Heron', tracks: [{ title: 'Heron song' }] });
        const second = await playlists.create({ name: 'rc-e2e Egret', tracks: [{ title: 'Egret song' }] });
        const one = new PlaylistScreen(app, first.name);
        await one.open();
        await expect(one.row('Heron song')).toBeInViewport();
        const two = new PlaylistScreen(app, second.name);
        await two.show();
        await expect(two.row('Egret song')).toBeInViewport();
        await one.show();
        await expect(one.row('Heron song')).toBeInViewport();
    });

    test('a swipe that ends before the page redraws leaves the playlists in place', async ({ app, playlists }) => {
        test.skip(app.drawerDocked, 'a docked drawer has no pager');
        // The last playlist: a swipe on towards the next one stays where it is.
        const last = await playlists.create({ name: 'rc-e2e Plover', tracks: 3 });
        const screen = new PlaylistScreen(app, last.name);
        await screen.open();
        await screen.list.hover();
        // A busy page, such as one drawing a list that still scrolls by inertia,
        // gets the move that starts the drag and the release in one go.
        await screen.list.evaluate(async list => {
            const box = list.getBoundingClientRect();
            const pointer = (x: number, buttons: number) => ({
                bubbles: true,
                pointerId: 7,
                pointerType: 'touch',
                isPrimary: true,
                clientX: x,
                clientY: box.y + box.height / 2,
                buttons,
            });
            list.dispatchEvent(new PointerEvent('pointerdown', pointer(300, 1)));
            await new Promise(resolve => setTimeout(resolve, 50));
            window.dispatchEvent(new PointerEvent('pointermove', pointer(260, 1)));
            window.dispatchEvent(new PointerEvent('pointerup', pointer(260, 0)));
        });
        await expect.poll(async () => Math.round((await screen.list.boundingBox())!.x)).toBe(0);
    });
});

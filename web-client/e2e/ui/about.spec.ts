import os from 'node:os';
import { expect, test } from './fixtures';
import { t } from './strings';

// The card of the player at the top of the drawer, and what it opens.
test.describe('player card', () => {
    test('name the player and tell its versions', async ({ app, player }) => {
        // A mobile opens on the expanded player.
        await app.goto('/');
        await player.collapse();
        await expect(app.page).toHaveTitle(`${os.hostname()} – ${t('app.name')}`);
        await app.openDrawer();
        const card = app.navigation.getByRole('button').filter({ hasText: os.hostname() });
        await expect(card).toContainText(/AIMP v?[0-9]/);

        await card.click();
        await expect(app.dialog.getByRole('heading')).toHaveText(os.hostname());
        // The value after the term.
        const fact = (term: string) =>
            app.dialog.getByRole('term').filter({ hasText: term }).locator('xpath=following-sibling::dd[1]');
        await expect(fact('AIMP')).toHaveText(/v?[0-9]/);
        await expect(fact(t('about.plugin'))).toHaveText(/^[0-9]+[.][0-9]+[.][0-9]+[.][0-9]+$/);
        await expect(app.dialog.getByRole('link', { name: t('about.licenses') })).toHaveAttribute(
            'href',
            '/_next/static/third-party-licenses.txt',
        );

        await app.dialog.getByRole('button', { name: t('actions.close') }).click();
        await expect(app.dialog).toBeHidden();
    });
});

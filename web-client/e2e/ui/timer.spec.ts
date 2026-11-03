import { expect, test } from './fixtures';
import { t, textPattern } from './strings';

// Only the player's own actions are started here; a computer action would shut
// the test machine down.
test.describe('timer', () => {
    test.beforeEach(async ({ app }) => {
        await app.goto('/timer/');
        await expect(app.heading).toHaveText(t('screens.timer'));
    });

    test('a timer after a set time is started and cancelled', async ({ api, app }) => {
        await expect(app.main.getByRole('radio', { name: t('timer.triggers.after') })).toBeChecked();
        await app.main.getByRole('textbox', { name: t('timer.duration') }).fill('01:15');
        await expect(app.main.getByRole('checkbox', { name: t('timer.actions.pause') })).toBeChecked();
        await expect(app.main.getByRole('radio', { name: t('timer.nothing') })).toBeChecked();
        await app.main.getByRole('button', { name: t('timer.start') }).click();

        await expect(app.main.getByText(t('timer.triggers.after'))).toBeVisible();
        // The countdown, as hours, minutes and seconds.
        await expect(app.main.getByText(/^1:1\d:\d\d$/)).toBeVisible();
        const { timer } = await api.timer();
        expect(timer).toMatchObject({ actions: ['pause'], trigger: 'after', waitTrackEnd: false });
        expect(timer!.expiresAt! - timer!.setAt!).toBe(75 * 60 * 1000);

        await app.main.getByRole('button', { name: t('timer.cancel') }).click();
        await expect(app.main.getByRole('button', { name: t('timer.start') })).toBeVisible();
        expect((await api.timer()).timer).toBeNull();
    });

    test('a timer at the end of some tracks counts them down', async ({ api, app }) => {
        await app.main.getByRole('radio', { name: t('timer.triggers.trackEnd') }).check();
        await app.main.getByRole('spinbutton', { name: t('timer.tracks') }).fill('3');
        await app.main.getByRole('checkbox', { name: t('timer.actions.closePlayer') }).check();
        await app.main.getByRole('checkbox', { name: t('timer.actions.pause') }).uncheck();
        await app.main.getByRole('button', { name: t('timer.start') }).click();

        await expect(app.main.getByText(t('timer.tracksLeft', { count: 3 }))).toBeVisible();
        await expect(app.main.getByText(t('timer.actions.closePlayer'))).toBeVisible();
        expect((await api.timer()).timer).toMatchObject({
            actions: ['closePlayer'],
            trigger: 'trackEnd',
            tracksLeft: 3,
        });
    });

    test('a timer set elsewhere shows at once, with a badge in the drawer', async ({ api, app }) => {
        await api.put('/timer', { actions: ['pause'], trigger: 'queueEnd' });
        await expect(app.main.getByText(t('timer.triggers.queueEnd'))).toBeVisible();
        await api.cancelTimer();
        await expect(app.main.getByRole('button', { name: t('timer.start') })).toBeVisible();

        await api.put('/timer', { actions: ['pause'], trigger: 'after', seconds: 600 });
        if (!app.drawerDocked) await app.backButton.click();
        await app.openDrawer();
        await expect(app.navigationLink(t('screens.timer')).getByTitle(textPattern('timer.badge'))).toBeVisible();
    });
});

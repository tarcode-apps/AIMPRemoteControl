import { expect, test } from './fixtures';
import { EffectsPage } from './pages/effects-page';
import { t } from './strings';

test.describe('equalizer', () => {
    let effects: EffectsPage;

    test.beforeEach(async ({ api, page }) => {
        await api.resetEffects();
        effects = new EffectsPage(page);
        await effects.open();
    });

    test('shows the equalizer with a custom curve', async () => {
        // The equalizer's own heading, or the screen's when it shares it with the effects.
        expect([t('effects.equalizer'), t('screens.effects')]).toContain(await effects.heading.innerText());
        await expect(effects.subtitle).toHaveText(t('effects.customPreset'));
        await expect(effects.band(0)).toHaveAttribute('aria-label', t('effects.band', { frequency: 31 }));
        await expect(effects.band(19)).toHaveAttribute(
            'aria-label',
            t('effects.band', { frequency: t('effects.kilohertz', { value: 22 }) }),
        );
        await expect(effects.equalizerSwitch).toBeChecked();
    });

    test('a dragged point sets its band and a stroke draws over several', async ({ api }) => {
        await effects.dragBand(0, 0, 7.5);
        const shown = await effects.bandGain(0);
        expect(shown).toBeGreaterThan(7);
        expect(shown).toBeLessThan(8);
        await expect.poll(() => api.effects().then(state => state.equalizer.bands[0].gain)).toBeCloseTo(shown, 1);

        // From band 5 at -6 dB to band 9 at +6 dB in one movement: the bands between
        // get the gains in between.
        await effects.stroke([await effects.pointAt(5, -6), await effects.pointAt(9, 6)]);
        await expect
            .poll(async () => (await api.effects()).equalizer.bands.slice(5, 10).map(band => band.gain))
            .toEqual([
                expect.closeTo(-6, 0),
                expect.closeTo(-3, 0),
                expect.closeTo(0, 0),
                expect.closeTo(3, 0),
                expect.closeTo(6, 0),
            ]);
        await expect(effects.subtitle).toHaveText(t('effects.customPreset'));
    });

    test('a held point resets its band, a held slider its value', async ({ api }) => {
        await effects.dragBand(0, 0, 7.5);
        await expect.poll(() => api.effects().then(state => state.equalizer.bands[0].gain)).toBeGreaterThan(7);

        await effects.holdAt(await effects.pointAt(0, 7.5));
        await expect(effects.band(0)).toHaveAttribute('aria-valuenow', '0');
        await expect.poll(() => api.effects().then(state => state.equalizer.bands[0].gain)).toBe(0);

        await effects.setSlider(t('effects.preamp'), 2.5);
        await expect.poll(() => api.effects().then(state => state.equalizer.preamp)).toBeCloseTo(2.5, 1);
        await effects.holdSlider(t('effects.preamp'));
        await expect.poll(() => api.effects().then(state => state.equalizer.preamp)).toBe(0);
    });

    test('the switch and AUTO drive the player', async ({ api }) => {
        await effects.equalizerSwitch.click();
        await expect.poll(() => api.effects().then(state => state.equalizer.active)).toBe(false);
        await effects.equalizerSwitch.click();
        await expect.poll(() => api.effects().then(state => state.equalizer.active)).toBe(true);

        await effects.autoButton.click();
        await expect(effects.autoButton).toHaveAttribute('aria-pressed', 'true');
        await expect.poll(() => api.effects().then(state => state.equalizer.auto)).toBe(true);
        await effects.autoButton.click();
        await expect.poll(() => api.effects().then(state => state.equalizer.auto)).toBe(false);
    });

    test('a chosen preset is applied at once; Cancel takes it back, OK keeps it', async ({ api }) => {
        await effects.openPresets();
        await effects.presetOption('Rock').check();
        await expect.poll(() => api.effects().then(state => state.equalizer.preset)).toBe('Rock');
        await expect(effects.subtitle).toHaveText('Rock');
        await effects.presetOption('Pop').check();
        await expect.poll(() => api.effects().then(state => state.equalizer.preset)).toBe('Pop');

        await effects.dialogButton(t('actions.cancel')).click();
        await expect(effects.dialog).toBeHidden();
        await expect.poll(async () => (await api.effects()).equalizer.bands.every(band => band.gain === 0)).toBe(true);
        await expect(effects.subtitle).toHaveText(t('effects.customPreset'));

        await effects.openPresets();
        await effects.presetOption('Rock').check();
        await effects.dialogButton(t('actions.ok')).click();
        await expect(effects.dialog).toBeHidden();
        await expect.poll(() => api.effects().then(state => state.equalizer.preset)).toBe('Rock');
        await expect(effects.subtitle).toHaveText('Rock');
    });

    test('an effect slider sets its effect and a held one takes it back', async ({ api }) => {
        await effects.showEffects();
        await effects.setSlider(t('effects.names.echo'), 0.35);
        await expect.poll(() => api.effects().then(state => state.echo)).toBeCloseTo(0.35, 2);
        await expect(effects.page.getByText(t('effects.percent', { value: 35 }), { exact: true })).toBeVisible();

        await effects.holdSlider(t('effects.names.echo'));
        await expect.poll(() => api.effects().then(state => state.echo)).toBe(0);
    });
});

test.describe('equalizer presets', () => {
    let effects: EffectsPage;

    test.beforeEach(async ({ api, page }) => {
        await api.resetEffects();
        effects = new EffectsPage(page);
        await effects.open();
    });

    test('the setting is saved as a preset and loaded back', async ({ api, presets }) => {
        const name = presets.name('saved');
        await effects.dragBand(0, 0, 6);
        await effects.saveAs(name);
        await expect(effects.subtitle).toHaveText(name);
        expect(await api.presetNames()).toContain(name);

        await api.resetEffects();
        await expect(effects.subtitle).toHaveText(t('effects.customPreset'));
        await effects.openPresets();
        await effects.presetOption(name).check();
        await effects.dialogButton(t('actions.ok')).click();
        await expect.poll(async () => (await api.effects()).equalizer.bands[0].gain).toBeGreaterThan(5);
    });

    test('a preset is renamed, replaced and deleted while managing', async ({ api, presets }) => {
        const name = presets.name('managed');
        const renamed = presets.name('renamed');
        await effects.dragBand(0, 0, 6);
        await effects.saveAs(name);
        await effects.managePresets();

        await effects
            .presetRow(name)
            .getByRole('button', { name: t('effects.renamePreset') })
            .click();
        await effects.topDialog.getByRole('textbox').fill(renamed);
        await effects.topDialog.getByRole('button', { name: t('actions.ok'), exact: true }).click();
        await expect(effects.presetRow(renamed)).toBeVisible();
        expect(await api.presetNames()).toEqual(expect.arrayContaining([renamed]));
        expect(await api.presetNames()).not.toContain(name);

        // The current setting replaces the preset's own.
        await effects.dialogButton(t('actions.ok')).click();
        await effects.dragBand(0, 6, -6);
        await effects.managePresets();
        await effects
            .presetRow(renamed)
            .getByRole('button', { name: t('effects.replacePreset') })
            .click();
        await expect(effects.topDialog).toContainText(t('effects.replacePresetConfirm', { name: renamed }));
        await effects.topDialog.getByRole('button', { name: t('effects.replace'), exact: true }).click();
        await expect(effects.page.getByRole('dialog')).toHaveCount(1);
        await effects.dialogButton(t('actions.ok')).click();
        await api.resetEffects();
        await expect(effects.subtitle).toHaveText(t('effects.customPreset'));
        await effects.openPresets();
        await effects.presetOption(renamed).check();
        await effects.dialogButton(t('actions.ok')).click();
        await expect.poll(async () => (await api.effects()).equalizer.bands[0].gain).toBeLessThan(-5);

        await effects.managePresets();
        await effects
            .presetRow(renamed)
            .getByRole('button', { name: t('effects.removePreset') })
            .click();
        await expect(effects.topDialog).toContainText(t('effects.removePresetConfirm', { name: renamed }));
        await effects.topDialog.getByRole('button', { name: t('actions.delete'), exact: true }).click();
        await expect(effects.presetRow(renamed)).toHaveCount(0);
        expect(await api.presetNames()).not.toContain(renamed);
    });
});

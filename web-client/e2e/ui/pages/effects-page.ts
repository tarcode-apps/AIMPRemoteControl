import { expect, type Locator, type Page } from '@playwright/test';
import { t, textPattern } from '../strings';
import { waitForViewport } from './app';

// As EqualizerView lays the plot out: equal slots for the bands along one axis,
// the gain range along the other with room for a point at either end.
const bandCount = 20;
const gainRange = 15;
const plotPadding = 8;
// Longer than the hold that resets a value.
const holdDuration = 700;

export type Point = { x: number; y: number };

// The sound effects screen: the equalizer with its presets and the effects.
export class EffectsPage {
    readonly heading: Locator;
    readonly subtitle: Locator;
    // The screen's area, which says what it shows: equalizer, effects or combined.
    readonly area: Locator;
    readonly plot: Locator;
    readonly equalizerSwitch: Locator;
    readonly autoButton: Locator;
    readonly moreButton: Locator;
    readonly dialog: Locator;
    // A dialog opened from another one, as a preset's rename or delete is.
    readonly topDialog: Locator;

    constructor(readonly page: Page) {
        this.heading = page.getByRole('heading', { level: 1 });
        this.subtitle = page.getByTestId('screen-subtitle');
        this.area = page.locator('[data-view]');
        this.plot = page.getByTestId('equalizer-plot');
        this.equalizerSwitch = page.getByRole('switch', { name: t('effects.enable') });
        this.autoButton = page.getByRole('button', { name: t('effects.auto') });
        this.moreButton = page.getByRole('button', { name: t('effects.more') });
        this.dialog = page.getByRole('dialog').first();
        this.topDialog = page.getByRole('dialog').last();
    }

    async open() {
        await this.page.goto('/effects/');
        await waitForViewport(this.page);
        await expect(this.area).toHaveAttribute('data-view', /^(equalizer|combined)$/);
        await expect(this.plot).toBeVisible();
    }

    // On a large screen the equalizer and the effects share the screen and the
    // toolbar has no button to swap them.
    async isCombined(): Promise<boolean> {
        return (await this.area.getAttribute('data-view')) === 'combined';
    }

    async showEffects() {
        if (await this.isCombined()) return;
        await this.page.getByRole('button', { name: t('effects.showEffects') }).click();
        await expect(this.area).toHaveAttribute('data-view', 'effects');
    }

    async showEqualizer() {
        if (await this.isCombined()) return;
        await this.page.getByRole('button', { name: t('effects.showEqualizer') }).click();
        await expect(this.area).toHaveAttribute('data-view', 'equalizer');
    }

    // The keyboard handle of a band, which also tells the gain shown.
    band(index: number): Locator {
        return this.page.getByRole('slider', { name: textPattern('effects.band') }).nth(index);
    }

    async bandGain(index: number): Promise<number> {
        return Number(await this.band(index).getAttribute('aria-valuenow'));
    }

    // A slider by its name: Balance, Preamp or an effect such as Echo.
    slider(name: string): Locator {
        return this.page.getByRole('slider', { name, exact: true });
    }

    // Where the plot draws band `index` at `gain`.
    async pointAt(index: number, gain: number): Promise<Point> {
        await expect(this.plot).toBeVisible();
        const box = await this.plot.boundingBox();
        if (!box) throw new Error('the plot is not on screen');
        const horizontal = (await this.page.locator('[data-layout]').getAttribute('data-layout')) === 'horizontal';
        const slot = (index + 0.5) / bandCount;
        const fraction = (gain + gainRange) / (2 * gainRange);
        return horizontal
            ? { x: box.x + slot * box.width, y: box.y + plotPadding + (1 - fraction) * (box.height - 2 * plotPadding) }
            : { x: box.x + plotPadding + fraction * (box.width - 2 * plotPadding), y: box.y + slot * box.height };
    }

    // A stroke over the plot through the points, the first pressed and the last released.
    async stroke(points: Point[]) {
        const [first, ...rest] = points;
        await this.page.mouse.move(first.x, first.y);
        await this.page.mouse.down();
        for (const point of rest) await this.page.mouse.move(point.x, point.y, { steps: 4 });
        await this.page.mouse.up();
    }

    async dragBand(index: number, from: number, to: number) {
        await this.stroke([await this.pointAt(index, from), await this.pointAt(index, to)]);
    }

    // A press held still, which resets what is under it.
    async holdAt({ x, y }: Point) {
        await this.page.mouse.move(x, y);
        await this.page.mouse.down();
        await this.page.waitForTimeout(holdDuration);
        await this.page.mouse.up();
    }

    async holdSlider(name: string) {
        const box = await this.slider(name).boundingBox();
        if (!box) throw new Error(`the ${name} slider is not on screen`);
        await this.holdAt({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    }

    // Sets a range input as a user would, so that the client sees the change.
    async setSlider(name: string, value: number) {
        await this.slider(name).evaluate((input: HTMLInputElement, next) => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(next));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        }, value);
    }

    async chooseMenuItem(name: string) {
        await this.moreButton.click();
        await this.page.getByRole('menuitem', { name }).click();
    }

    async openPresets() {
        await this.chooseMenuItem(t('effects.presets'));
        await expect(this.dialog).toBeVisible();
    }

    presetOption(name: string): Locator {
        return this.dialog.getByRole('radio', { name, exact: true });
    }

    dialogButton(name: string): Locator {
        return this.dialog.getByRole('button', { name, exact: true });
    }

    // Presets are managed in the presets dialog after its Manage presets button.
    async managePresets() {
        await this.openPresets();
        const manage = this.dialog.getByRole('button', { name: t('effects.managePresets') });
        await manage.click();
        await expect(manage).toHaveAttribute('aria-pressed', 'true');
    }

    // A preset's row while managing, with its Replace, Rename and Delete buttons.
    presetRow(name: string): Locator {
        return this.dialog.getByRole('listitem').filter({ hasText: name });
    }

    async saveAs(name: string) {
        await this.chooseMenuItem(t('effects.saveAs'));
        await this.dialog.getByRole('textbox').fill(name);
        await this.dialogButton(t('actions.ok')).click();
        await expect(this.dialog).toBeHidden();
    }
}

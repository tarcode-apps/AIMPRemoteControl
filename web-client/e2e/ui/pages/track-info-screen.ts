import { expect, type Locator } from '@playwright/test';
import { t, type TextKey } from '../strings';
import type { App } from './app';

// The fields of the screen, by the keys of their labels.
type FieldOf<Key> = Key extends `trackInfo.fields.${infer Field}` ? Field : never;
type Field = FieldOf<TextKey>;

// One finger's touch, placed from the centre of the screen.
type TouchType = 'pointerdown' | 'pointermove' | 'pointerup';
type Touch = { type: TouchType; finger: number; dx: number; dy: number };

// The track information: the cover and the stream's parameters, a page of
// tags or of the lyrics, the file's URI, and a toolbar that switches the pages
// and copies everything.
export class TrackInfoScreen {
    readonly lines: Locator;
    // Shows the image over everything, once the track turns out to have one.
    readonly cover: Locator;

    constructor(readonly app: App) {
        this.lines = app.main.getByTestId('track-info-line');
        this.cover = app.main.getByRole('button', { name: t('trackInfo.cover'), exact: true });
    }

    // A field's line, by the field's label, which a mobile keeps out of sight
    // until a hold shows it.
    line(field: Field): Locator {
        return this.lines.filter({
            has: this.app.page.getByText(t(`trackInfo.fields.${field}`), { exact: true }),
        });
    }

    value(field: Field): Locator {
        return this.line(field).getByRole('definition');
    }

    toolbarButton(name: string): Locator {
        return this.app.main.getByRole('button', { name, exact: true });
    }

    async showLyrics() {
        await this.toolbarButton(t('trackInfo.showLyrics')).click();
        await expect(this.value('lyrics')).toBeVisible();
    }

    async showTags() {
        await this.toolbarButton(t('trackInfo.showTags')).click();
        await expect(this.value('title')).toBeVisible();
    }

    async copy() {
        await this.toolbarButton(t('trackInfo.copy')).click();
        await expect(this.app.toast).toHaveText(t('trackInfo.copied'));
    }

    // A click on a value's text copies it; the text is a button of its own width.
    async copyValue(field: Field) {
        await this.value(field).getByRole('button').click();
        await expect(this.app.toast).toHaveText(t('trackInfo.copied'));
    }

    // The cover over everything, which the browser's own menu saves.
    get viewer(): Locator {
        return this.app.page.getByRole('dialog', { name: t('trackInfo.cover') });
    }

    // Opens the viewer and waits for the image to have grown out of the cover.
    async viewCover() {
        await expect(this.cover).toBeEnabled();
        await this.cover.click();
        const image = this.viewer.getByRole('img');
        await expect.poll(() => image.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
        await image.evaluate(async image => {
            await new Promise(resolve => requestAnimationFrame(resolve));
            await Promise.all(image.getAnimations().map(animation => animation.finished));
        });
    }

    // Playwright has no multi-touch, so touches are pointer events sent to the
    // image by hand; with `aFrameApart` each move waits for the next frame, as
    // a finger's do. Positions are from the viewer's centre, which is the screen's.
    private async touch(touches: Touch[], aFrameApart = false) {
        const { width, height } = this.app.page.viewportSize()!;
        await this.viewer.evaluate(
            async (viewer, { touches, aFrameApart, centre }) => {
                const target = viewer.querySelector('img')!;
                for (const { type, finger, dx, dy } of touches) {
                    if (aFrameApart && type === 'pointermove')
                        await new Promise(resolve => requestAnimationFrame(resolve));
                    target.dispatchEvent(
                        new PointerEvent(type, {
                            pointerId: finger,
                            pointerType: 'touch',
                            clientX: centre.x + dx,
                            clientY: centre.y + dy,
                            bubbles: true,
                        }),
                    );
                }
            },
            { touches, aFrameApart, centre: { x: width / 2, y: height / 2 } },
        );
    }

    // Two fingers about a point `below` the centre, `apart` pixels from each
    // other, spread to `to`; with `lift: false` they stay on the screen.
    async pinch(apart: number, to: number, { below = 0, lift = true } = {}) {
        const pair = (type: TouchType, spread: number): Touch[] => [
            { type, finger: 1, dx: -spread / 2, dy: below },
            { type, finger: 2, dx: spread / 2, dy: below },
        ];
        const moves = Array.from({ length: 5 }, (_, i) => pair('pointermove', apart + ((to - apart) * (i + 1)) / 5));
        await this.touch([...pair('pointerdown', apart), ...moves.flat(), ...(lift ? pair('pointerup', to) : [])]);
    }

    // Lifts the two fingers a `pinch` left on the screen, `apart` from each other.
    async lift(apart: number, { below = 0 } = {}) {
        await this.touch([
            { type: 'pointerup', finger: 1, dx: -apart / 2, dy: below },
            { type: 'pointerup', finger: 2, dx: apart / 2, dy: below },
        ]);
    }

    // A quick sideways drag by one finger from the centre, a step a frame, which
    // lifts while still moving; with `lift: false` the finger stays down.
    async flick(dx: number, { lift = true } = {}) {
        const moves = Array.from({ length: 4 }, (_, i) => ({
            type: 'pointermove' as const,
            finger: 3,
            dx: (dx * (i + 1)) / 4,
            dy: 0,
        }));
        const up: Touch[] = lift ? [{ type: 'pointerup', finger: 3, dx, dy: 0 }] : [];
        await this.touch([{ type: 'pointerdown', finger: 3, dx: 0, dy: 0 }, ...moves, ...up], true);
    }

    // Lifts the finger a `flick` left down.
    async liftFinger() {
        await this.touch([{ type: 'pointerup', finger: 3, dx: 0, dy: 0 }]);
    }

    // How far the image is moved sideways.
    imageOffset(): Promise<number> {
        return this.viewer.getByRole('img').evaluate(image => new DOMMatrix(getComputedStyle(image).transform).e);
    }

    // Where on the image, as fractions of its box, the point `below` the
    // viewer's centre falls.
    imagePointAt(below: number): Promise<{ x: number; y: number }> {
        return this.viewer.getByRole('img').evaluate((image, below) => {
            const box = image.getBoundingClientRect();
            return {
                x: (innerWidth / 2 - box.left) / box.width,
                y: (innerHeight / 2 + below - box.top) / box.height,
            };
        }, below);
    }

    // How much the image is zoomed in.
    imageScale(): Promise<number> {
        return this.viewer.getByRole('img').evaluate(image => new DOMMatrix(getComputedStyle(image).transform).a);
    }

    async expectOpen(fileName: string) {
        await expect(this.app.heading).toHaveText(t('trackInfo.title'));
        await expect(this.app.subtitle).toHaveText(fileName);
    }
}

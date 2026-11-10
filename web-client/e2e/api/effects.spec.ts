import type { EffectsState } from '@/app/_api/types';
import { expect, test } from '../fixtures';

// A value the player reports differs from the one sent by its rounding only.
const closeTo = (value: number) => expect.closeTo(value, 2);

test.describe('effects', () => {
    test.beforeEach(async ({ api }) => {
        await api.resetEffects();
    });

    test('reports every value and the 20 bands of the equalizer', async ({ api }) => {
        const state = await api.effects();
        expect(state).toMatchObject({ balance: 0, echo: 0, enhancer: 1, speed: 1, tempo: 1, pitch: 0 });
        expect(state.equalizer.bands).toHaveLength(20);
        expect(state.equalizer.bands[0].frequency).toBe(31.5);
        expect(state.equalizer.bands[19].frequency).toBe(22000);
    });

    const refused: [string, unknown][] = [
        ['an empty body', {}],
        ['an array', []],
        ['a balance beyond the right', { balance: 1.5 }],
        ['a speed below half', { speed: 0.4 }],
        ['a tempo above triple', { tempo: 3.1 }],
        ['a pitch below -10', { pitch: -11 }],
        ['an echo above 1', { echo: 2 }],
        ['a negative bass', { trueBass: -0.1 }],
        ['an enhancer below 1', { enhancer: 0.9 }],
        ['a balance as text', { balance: '0' }],
        ['an equalizer that is not an object', { equalizer: 1 }],
        ['a preamp above 15 dB', { equalizer: { preamp: 16 } }],
        ['bands that are not a list', { equalizer: { bands: {} } }],
        ['a band without a gain', { equalizer: { bands: [{ index: 0 }] } }],
        ['a gain above 15 dB', { equalizer: { bands: [{ index: 0, gain: 15.1 }] } }],
        ['a negative band index', { equalizer: { bands: [{ index: -1, gain: 0 }] } }],
        ['a band index beyond the last', { equalizer: { bands: [{ index: 20, gain: 0 }] } }],
        ['an active flag that is not a boolean', { equalizer: { active: 1 } }],
    ];
    for (const [what, body] of refused)
        test(`refuses ${what}`, async ({ api }) => {
            const before = await api.effects();
            const response = await api.patch('/effects', body);
            expect(response.status).toBe(400);
            expect(response.error?.code).toBe('invalidBody');
            expect(await api.effects()).toEqual(before);
        });

    test('sets every value, answers the new state and raises one event', async ({ api, events }) => {
        const values = {
            balance: 0.25,
            speed: 1.2,
            tempo: 0.8,
            pitch: -2.5,
            echo: 0.3,
            reverb: 0.4,
            flanger: 0.5,
            chorus: 0.6,
            trueBass: 1.5,
            enhancer: 3,
        };
        const before = await api.effects();
        const event = events.next<EffectsState>('effects', state => state.revision > before.revision);

        const answer = await api.setEffects(values);

        expect(answer.revision).toBeGreaterThan(before.revision);
        for (const [name, value] of Object.entries(values)) expect(answer, name).toHaveProperty(name, closeTo(value));
        expect(await event).toMatchObject({ balance: closeTo(0.25), enhancer: closeTo(3) });
        // The burst of the player's own notifications is sent as one event.
        expect(
            events.received('effects').filter(e => (e.data as EffectsState).revision > before.revision),
        ).toHaveLength(1);
    });

    test('sets the equalizer and names no preset for a custom curve', async ({ api }) => {
        const state = await api.setEffects({
            equalizer: {
                active: true,
                auto: false,
                preamp: 2.5,
                bands: [
                    { index: 0, gain: 3 },
                    { index: 19, gain: -4.5 },
                ],
            },
        });
        expect(state.equalizer).toMatchObject({ active: true, auto: false, preamp: closeTo(2.5), preset: null });
        expect(state.equalizer.bands[0].gain).toEqual(closeTo(3));
        expect(state.equalizer.bands[19].gain).toEqual(closeTo(-4.5));
        expect(state.equalizer.bands[1].gain).toBe(0);
    });

    test('turns automatic presets on and off', async ({ api }) => {
        expect((await api.setEffects({ equalizer: { auto: true } })).equalizer.auto).toBe(true);
        expect((await api.setEffects({ equalizer: { auto: false } })).equalizer.auto).toBe(false);
    });

    test.describe('presets', () => {
        test("lists the player's library", async ({ api }) => {
            const names = await api.presetNames();
            expect(names.length).toBeGreaterThan(0);
            expect(names).toContain('Rock');
        });

        test('applies a library preset, which a changed band leaves', async ({ api }) => {
            expect((await api.post('/effects/presets/apply', { name: 'Rock' })).status).toBe(200);
            const applied = await api.effects();
            expect(applied.equalizer.preset).toBe('Rock');

            const changed = await api.setEffects({
                equalizer: { bands: [{ index: 5, gain: applied.equalizer.bands[5].gain > 0 ? -1 : 1 }] },
            });
            expect(changed.equalizer.preset).toBeNull();
        });

        test('saves, replaces, renames and removes a preset of its own', async ({ api, presets }) => {
            const name = presets.name('curve');
            const renamed = presets.name('renamed');
            await api.setEffects({
                equalizer: {
                    bands: [
                        { index: 0, gain: 4 },
                        { index: 7, gain: -3 },
                    ],
                },
            });

            // Saving keeps the curve under the name, trimmed, and the state names it.
            expect((await api.post('/effects/presets', { name: `  ${name} ` })).status).toBe(200);
            expect((await api.presetNames()).filter(n => n === name)).toHaveLength(1);
            expect((await api.effects()).equalizer.preset).toBe(name);

            // Saving under the same name replaces the preset rather than adding one.
            await api.setEffects({ equalizer: { bands: [{ index: 0, gain: 6 }] } });
            expect((await api.post('/effects/presets', { name })).status).toBe(200);
            expect((await api.presetNames()).filter(n => n === name)).toHaveLength(1);
            await api.post('/effects/presets/apply', { name: 'Rock' });
            expect((await api.post('/effects/presets/apply', { name })).status).toBe(200);
            const reapplied = await api.effects();
            expect(reapplied.equalizer.bands[0].gain).toEqual(closeTo(6));
            expect(reapplied.equalizer.preset).toBe(name);

            expect((await api.post('/effects/presets/rename', { name, newName: ` ${renamed} ` })).status).toBe(200);
            const names = await api.presetNames();
            expect(names).toContain(renamed);
            expect(names).not.toContain(name);
            expect((await api.effects()).equalizer.preset).toBe(renamed);

            expect((await api.post('/effects/presets/remove', { name: renamed })).status).toBe(200);
            expect(await api.presetNames()).not.toContain(renamed);
        });

        test('refuses unknown presets and bad names', async ({ api, presets }) => {
            const name = presets.name('mine');
            await api.post('/effects/presets', { name });

            expect((await api.post('/effects/presets/apply', { name: 'rc-e2e no such preset' })).error?.code).toBe(
                'presetNotFound',
            );
            expect((await api.post('/effects/presets/remove', { name: 'rc-e2e no such preset' })).error?.code).toBe(
                'presetNotFound',
            );
            expect(
                (await api.post('/effects/presets/rename', { name: 'rc-e2e no such preset', newName: 'x' })).error
                    ?.code,
            ).toBe('presetNotFound');
            expect((await api.post('/effects/presets/rename', { name, newName: 'Rock' })).error?.code).toBe(
                'presetExists',
            );
            expect((await api.post('/effects/presets/rename', { name, newName: name })).status).toBe(200);
            expect((await api.post('/effects/presets/apply', { name: '  ' })).error?.code).toBe('invalidBody');
            expect((await api.post('/effects/presets', {})).error?.code).toBe('invalidBody');
            expect((await api.post('/effects/presets/rename', { name })).error?.code).toBe('invalidBody');
        });

        test('measures a name in characters, not bytes', async ({ api, presets }) => {
            const prefix = presets.name('');
            const longest = prefix + 'я'.repeat(100 - prefix.length);
            expect((await api.post('/effects/presets', { name: longest })).status).toBe(200);
            expect((await api.post('/effects/presets', { name: longest + 'я' })).error?.code).toBe('invalidBody');
        });
    });
});

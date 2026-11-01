'use client';

import { errorMessage } from '@/app/_api/helpers/errors';
import { useSetTimer } from '@/app/_api/timer';
import { machineActions, timerTriggers, type TimerAction, type TimerTrigger } from '@/app/_api/types';
import { TextButton } from '@/app/_components/buttons';
import { Checkbox, Radio, TextField } from '@/app/_components/inputs';
import { Screen } from '@/app/_components/pages';
import { usePersistedState } from '@/app/_hooks/usePersistedState';
import clsx from 'clsx';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Timer.module.scss';

type FormState = {
    trigger: TimerTrigger;
    // For `after`, as "HH:MM".
    duration: string;
    // For `at`, as "HH:MM" of the local clock.
    time: string;
    // For `trackEnd`, as typed.
    tracks: string;
    waitTrackEnd: boolean;
    pause: boolean;
    closePlayer: boolean;
    machine: TimerAction | null;
};

const defaults: FormState = {
    trigger: 'after',
    duration: '00:30',
    time: '23:00',
    tracks: '1',
    waitTrackEnd: false,
    pause: true,
    closePlayer: false,
    machine: null,
};
const maxTracks = 1000;
const clock = /^(\d\d):(\d\d)$/;

// As a time field holds it: "HH:MM", or nothing once cleared.
const isClock = (value: unknown): value is string => typeof value === 'string' && (value === '' || clock.test(value));

function parseForm(stored: unknown): FormState | undefined {
    if (typeof stored !== 'object' || stored === null) return undefined;
    const form = stored as Partial<Record<keyof FormState, unknown>>;
    return {
        trigger: timerTriggers.includes(form.trigger as TimerTrigger)
            ? (form.trigger as TimerTrigger)
            : defaults.trigger,
        duration: isClock(form.duration) ? form.duration : defaults.duration,
        time: isClock(form.time) ? form.time : defaults.time,
        tracks: typeof form.tracks === 'string' && /^\d*$/.test(form.tracks) ? form.tracks : defaults.tracks,
        waitTrackEnd: form.waitTrackEnd === true,
        pause: form.pause !== false,
        closePlayer: form.closePlayer === true,
        machine: machineActions.includes(form.machine as TimerAction) ? (form.machine as TimerAction) : null,
    };
}

function durationSeconds(duration: string): number {
    const match = clock.exec(duration);
    return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 : 0;
}

// The next moment the local clock shows `time`: today, or tomorrow once it has passed.
function nextMoment(time: string, now = Date.now()): number | undefined {
    const match = clock.exec(time);
    if (!match) return undefined;
    const moment = new Date(now);
    moment.setHours(Number(match[1]), Number(match[2]), 0, 0);
    if (moment.getTime() <= now) moment.setDate(moment.getDate() + 1);
    return moment.getTime();
}

export type TimerFormScreenProps = {
    supportedActions: TimerAction[];
};

// The timer to set: what brings its moment and what it does then. The start
// button sits in the toolbar and submits the form from there.
export function TimerFormScreen({ supportedActions }: TimerFormScreenProps) {
    const { t } = useTranslation();
    const formId = useId();
    const [form, setForm] = usePersistedState<FormState>('timer.form', defaults, parseForm);
    const setTimer = useSetTimer();
    const update = (changes: Partial<FormState>) => setForm({ ...form, ...changes });

    const timed = form.trigger === 'after' || form.trigger === 'at';
    const machines = machineActions.filter(action => supportedActions.includes(action));
    const machine = form.machine && machines.includes(form.machine) ? form.machine : null;
    const actions: TimerAction[] = [
        ...(form.pause ? (['pause'] as const) : []),
        ...(form.closePlayer && !machine ? (['closePlayer'] as const) : []),
        ...(machine ? [machine] : []),
    ];
    const seconds = durationSeconds(form.duration);
    const tracks = Number(form.tracks);
    const ready =
        actions.length > 0 &&
        (form.trigger !== 'after' || seconds > 0) &&
        (form.trigger !== 'at' || nextMoment(form.time) !== undefined) &&
        (form.trigger !== 'trackEnd' || (Number.isInteger(tracks) && tracks >= 1 && tracks <= maxTracks));

    const start = () => {
        if (!ready || setTimer.isPending) return;
        setTimer.mutate({
            actions,
            trigger: form.trigger,
            ...(form.trigger === 'after' && { seconds }),
            ...(form.trigger === 'at' && { at: nextMoment(form.time) }),
            ...(form.trigger === 'trackEnd' && { tracks }),
            ...(timed && { waitTrackEnd: form.waitTrackEnd }),
        });
    };

    const waitTrackEnd = (
        <label className={styles.option}>
            <span className={styles.label}>{t('timer.waitTrackEnd')}</span>
            <Checkbox
                title={t('timer.waitTrackEnd')}
                checked={form.waitTrackEnd}
                onChange={event => update({ waitTrackEnd: event.target.checked })}
            />
        </label>
    );

    // What the chosen trigger needs, set in under its row.
    const fieldsUnder = (trigger: TimerTrigger) => {
        if (trigger !== form.trigger) return null;
        let fields;
        switch (trigger) {
            case 'after':
                fields = (
                    <>
                        <TextField
                            type="time"
                            className={styles.field}
                            value={form.duration}
                            required
                            aria-label={t('timer.duration')}
                            onChange={event => update({ duration: event.target.value })}
                        />
                        {waitTrackEnd}
                    </>
                );
                break;
            case 'at':
                fields = (
                    <>
                        <TextField
                            type="time"
                            className={styles.field}
                            value={form.time}
                            required
                            aria-label={t('timer.time')}
                            onChange={event => update({ time: event.target.value })}
                        />
                        {waitTrackEnd}
                    </>
                );
                break;
            case 'trackEnd':
                fields = (
                    <TextField
                        type="number"
                        className={styles.field}
                        value={form.tracks}
                        min={1}
                        max={maxTracks}
                        required
                        aria-label={t('timer.tracks')}
                        onChange={event => update({ tracks: event.target.value })}
                    />
                );
                break;
            default:
                return null;
        }
        return <div className={styles.nested}>{fields}</div>;
    };

    return (
        <Screen
            title={t('screens.timer')}
            toolbar={
                <div className={styles.toolbar}>
                    <TextButton
                        type="submit"
                        form={formId}
                        className={styles.mainButton}
                        disabled={!ready || setTimer.isPending}
                    >
                        {t('timer.start')}
                    </TextButton>
                </div>
            }
        >
            <form
                id={formId}
                className={styles.columns}
                onSubmit={event => {
                    event.preventDefault();
                    start();
                }}
            >
                <section>
                    <h2 className={styles.heading}>{t('timer.when')}</h2>
                    <div role="radiogroup" aria-label={t('timer.when')}>
                        {timerTriggers.map(trigger => (
                            <div key={trigger}>
                                <label className={styles.option}>
                                    <span className={styles.label}>{t(`timer.triggers.${trigger}`)}</span>
                                    <Radio
                                        name="trigger"
                                        value={trigger}
                                        checked={form.trigger === trigger}
                                        onChange={() => update({ trigger })}
                                    />
                                </label>
                                {fieldsUnder(trigger)}
                            </div>
                        ))}
                    </div>
                </section>
                <section>
                    <h2 className={styles.heading}>{t('timer.then')}</h2>
                    <label className={styles.option}>
                        <span className={styles.label}>{t('timer.actions.pause')}</span>
                        <Checkbox
                            title={t('timer.actions.pause')}
                            checked={form.pause}
                            onChange={event => update({ pause: event.target.checked })}
                        />
                    </label>
                    <label className={clsx(styles.option, machine && styles.disabled)}>
                        <span className={styles.label}>{t('timer.actions.closePlayer')}</span>
                        <Checkbox
                            title={t('timer.actions.closePlayer')}
                            checked={form.closePlayer}
                            disabled={machine !== null}
                            onChange={event => update({ closePlayer: event.target.checked })}
                        />
                    </label>
                    {machines.length > 0 && (
                        <>
                            <h3 className={styles.subheading}>{t('timer.computer')}</h3>
                            <div role="radiogroup" aria-label={t('timer.computer')}>
                                <label className={styles.option}>
                                    <span className={styles.label}>{t('timer.nothing')}</span>
                                    <Radio
                                        name="machine"
                                        value=""
                                        checked={machine === null}
                                        onChange={() => update({ machine: null })}
                                    />
                                </label>
                                {machines.map(action => (
                                    <label key={action} className={styles.option}>
                                        <span className={styles.label}>{t(`timer.actions.${action}`)}</span>
                                        <Radio
                                            name="machine"
                                            value={action}
                                            checked={machine === action}
                                            onChange={() => update({ machine: action })}
                                        />
                                    </label>
                                ))}
                            </div>
                        </>
                    )}
                </section>
                {setTimer.error && (
                    <p className={styles.error} role="alert">
                        {errorMessage(setTimer.error, t)}
                    </p>
                )}
            </form>
        </Screen>
    );
}

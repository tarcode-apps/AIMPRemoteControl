import type { TFunction } from 'i18next';

// "31", "350", "1 k", "11.2 k": as the player's own equalizer labels its bands.
export function formatFrequency(hertz: number, t: TFunction, locale: string): string {
    if (hertz < 1000) return new Intl.NumberFormat(locale).format(Math.floor(hertz));
    return t('effects.kilohertz', {
        value: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(hertz / 1000),
    });
}

// "+10.6", "-1.2", "0.0".
export function formatGain(decibels: number, locale: string): string {
    return new Intl.NumberFormat(locale, {
        signDisplay: 'exceptZero',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    }).format(decibels);
}

export function formatDecibels(decibels: number, t: TFunction, locale: string): string {
    return t('effects.decibels', { value: formatGain(decibels, locale) });
}

// "0%", "L 25%", "R 25%".
export function formatBalance(balance: number, t: TFunction): string {
    const percent = Math.round(Math.abs(balance) * 100);
    if (percent === 0) return t('effects.percent', { value: 0 });
    return t(balance < 0 ? 'effects.balanceLeft' : 'effects.balanceRight', { value: percent });
}

export function formatDuration(seconds: number): string {
    const total = Math.round(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    const mm = hours ? String(minutes).padStart(2, '0') : String(minutes);
    const ss = String(rest).padStart(2, '0');
    return hours ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

// To the millisecond, as the player's track information shows it: "2:19.005".
export function formatPreciseDuration(seconds: number): string {
    const milliseconds = Math.round(seconds * 1000);
    const whole = Math.floor(milliseconds / 1000);
    return `${formatDuration(whole)}.${String(milliseconds % 1000).padStart(3, '0')}`;
}

// In whole kilobytes, as the player's track information shows a size: "28 930 KB".
export function formatKilobytes(bytes: number, locale: string): string {
    return new Intl.NumberFormat(locale, { style: 'unit', unit: 'kilobyte', maximumFractionDigits: 0 }).format(
        bytes / 1024,
    );
}

export function formatSize(bytes: number, locale: string): string {
    const gigabyte = 1024 ** 3;
    const [value, unit] = bytes >= gigabyte ? [bytes / gigabyte, 'gigabyte'] : [bytes / 1024 ** 2, 'megabyte'];
    return new Intl.NumberFormat(locale, { style: 'unit', unit, maximumFractionDigits: 1 }).format(value);
}

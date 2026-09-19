export function formatDuration(seconds: number): string {
    const total = Math.round(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    const mm = hours ? String(minutes).padStart(2, '0') : String(minutes);
    const ss = String(rest).padStart(2, '0');
    return hours ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatSize(bytes: number, locale: string): string {
    const gigabyte = 1024 ** 3;
    const [value, unit] = bytes >= gigabyte ? [bytes / gigabyte, 'gigabyte'] : [bytes / 1024 ** 2, 'megabyte'];
    return new Intl.NumberFormat(locale, { style: 'unit', unit, maximumFractionDigits: 1 }).format(value);
}

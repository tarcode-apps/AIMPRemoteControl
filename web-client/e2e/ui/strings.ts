import en from '../../app/_i18n/en.json';

// The client's English texts by their keys, as the client itself looks them up:
// a reworded label changes en.json and the tests follow.

type Keys<T, Prefix extends string = ''> = {
    [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Keys<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type TextKey = Keys<typeof en>;

const placeholder = /\{\{(\w+)\}\}/g;

function template(key: TextKey): string {
    const text = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], en);
    if (typeof text !== 'string') throw new Error(`en.json has no text for ${key}`);
    return text;
}

export function t(key: TextKey, values: Record<string, string | number> = {}): string {
    return template(key).replace(placeholder, (_, name: string) => {
        if (!(name in values)) throw new Error(`${key} needs a value for {{${name}}}`);
        return String(values[name]);
    });
}

// Matches the text of `key` whatever its placeholders hold.
export function textPattern(key: TextKey): RegExp {
    return new RegExp(
        `^${template(key)
            .split(placeholder)
            .filter((_, i) => i % 2 === 0)
            .map(RegExp.escape)
            .join('.+')}$`,
    );
}

// Matches a name followed by its badge, as a drawer link with a count reads.
export function withBadge(name: string, badge: string | number): RegExp {
    return new RegExp(`^${RegExp.escape(name)}\\s*${RegExp.escape(String(badge))}$`);
}

// Matches a text that starts with `text`, such as a link's name followed by its badge.
export function startsWith(text: string): RegExp {
    return new RegExp(`^${RegExp.escape(text)}(\\s|$)`);
}

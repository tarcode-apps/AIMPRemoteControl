import { useState } from 'react';

// Runs `onChange` in the render that first sees another `value`, before the
// render is drawn: for state that follows the value, as a cursor the list's
// positions move under.
export function useOnChange<T>(value: T, onChange: (previous: T) => void) {
    const [seen, setSeen] = useState(value);
    if (seen !== value) {
        setSeen(value);
        onChange(seen);
    }
}

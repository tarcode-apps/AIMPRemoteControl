'use client';

import { Checkbox, type CheckboxProps } from './Checkbox';

export type ListCheckboxProps = Omit<CheckboxProps, 'variant'>;

// The compact checkbox of list rows, drawn in the text colour.
export function ListCheckbox(props: ListCheckboxProps) {
    return <Checkbox {...props} variant="list" />;
}

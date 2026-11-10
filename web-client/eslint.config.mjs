import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTs,
    // Override default ignores of eslint-config-next.
    globalIgnores([
        // Default ignores of eslint-config-next:
        '.next/**',
        'out/**',
        'build/**',
        'next-env.d.ts',
        // What the end-to-end tests create, traces included.
        'e2e/runtime/**',
    ]),
    // Playwright fixtures hand their value over through a function named `use`.
    { files: ['e2e/**'], rules: { 'react-hooks/rules-of-hooks': 'off' } },
]);

export default eslintConfig;

'use strict';

// Workaround for https://github.com/vercel/next.js/issues/73427
// Remove after PR merged https://github.com/vercel/next.js/pull/73912/files
//
// With `output: 'export'` the client requests segment RSC payloads by a flat
// name, e.g. `/queue/__next.!<base64>.queue.__PAGE__.txt`, but the export
// writes them as a nested tree: `out/queue/__next.!<base64>/queue/__PAGE__.txt`.
// Flatten every `__next.*` directory into its parent, joining path segments
// with dots, so the files exist under the names the client asks for.

import { readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = 'out';
const SEGMENT_DIR_PREFIX = '__next.';

// Recursively move all files from directory to target directory with flattened names
function flattenDirectory(sourceDir, targetDir, prefix) {
    for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
        const sourcePath = join(sourceDir, entry.name);
        const newName = `${prefix}.${entry.name}`;

        if (entry.isFile()) {
            const targetPath = join(targetDir, newName);
            console.log(`Moving: ${sourcePath} -> ${targetPath}`);
            renameSync(sourcePath, targetPath);
        } else if (entry.isDirectory()) {
            flattenDirectory(sourcePath, targetDir, newName);
        }
    }
}

// Walk the export and flatten every `__next.*` directory found
function fixDirectory(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;

        const path = join(dir, entry.name);
        if (entry.name.startsWith(SEGMENT_DIR_PREFIX)) {
            console.log(`Found directory: ${path}`);
            flattenDirectory(path, dir, entry.name);
            console.log(`Removing directory: ${path}`);
            rmSync(path, { recursive: true, force: true });
        } else {
            fixDirectory(path);
        }
    }
}

fixDirectory(OUT_DIR);

console.log('Build fix completed!');

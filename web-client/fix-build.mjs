'use strict';

// Workaround for https://github.com/vercel/next.js/issues/73427
// Remove after PR merged https://github.com/vercel/next.js/pull/73912/files

import { existsSync, globSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, parse } from 'node:path';

// Recursively move all files from directory to target directory with flattened names
function flattenDirectory(sourceDir, targetDir, prefix = '') {
    const entries = readdirSync(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
        const sourcePath = join(sourceDir, entry.name);
        const newName = prefix ? `${prefix}.${entry.name}` : entry.name;

        if (entry.isFile()) {
            const targetPath = join(targetDir, newName);
            console.log(`Moving: ${sourcePath} -> ${targetPath}`);
            renameSync(sourcePath, targetPath);
        } else if (entry.isDirectory()) {
            // Recursively flatten subdirectories
            flattenDirectory(sourcePath, targetDir, newName);
        }
    }
}

const txtFiles = globSync(['out/**/__next.!*.txt', 'out/**/__next._not-found.txt']);
for (const txtFile of txtFiles) {
    const fileDir = dirname(txtFile);
    const fileName = basename(txtFile);
    const fileNameWithoutExt = parse(fileName).name;
    const correspondingDir = join(fileDir, fileNameWithoutExt);

    // Check if there's a directory with the same name
    if (existsSync(correspondingDir) && statSync(correspondingDir).isDirectory()) {
        console.log(`Found directory: ${correspondingDir}`);

        // Flatten the directory structure
        flattenDirectory(correspondingDir, fileDir, fileNameWithoutExt);

        // Remove the now-empty directory
        console.log(`Removing directory: ${correspondingDir}`);
        rmSync(correspondingDir, { recursive: true, force: true });
    }
}

console.log('Build fix completed!');

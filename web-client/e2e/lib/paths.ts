import path from 'node:path';

export const e2eDir = path.resolve(__dirname, '..');
export const webClientDir = path.resolve(e2eDir, '..');
export const repoRoot = path.resolve(webClientDir, '..');

// Everything a run creates: the throwaway player, the generated tracks,
// Playwright's results and its report. Ignored by git.
export const runtimeDir = path.join(e2eDir, 'runtime');

// The built plugin, as `plugin/build-windows.ps1 -Arch x64` leaves it.
export const pluginDistDir = path.join(repoRoot, 'plugin', 'dist', 'windows-x64');

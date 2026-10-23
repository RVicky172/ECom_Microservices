#!/usr/bin/env node
/**
 * `npm run dashboard` entry point: installs the dashboard's own dependencies on
 * first run (it is not part of the root workspaces), then starts the dev server
 * on http://127.0.0.1:3100.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const appDir = join(import.meta.dirname, '..');
const run = (command) => {
  const result = spawnSync(command, { cwd: appDir, stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

if (!existsSync(join(appDir, 'node_modules', 'next'))) {
  console.log('spec-dashboard: installing dependencies (first run)…');
  run('npm install --no-audit --no-fund');
}
run('npm run dev');

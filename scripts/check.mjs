#!/usr/bin/env node
/**
 * Fast quality gate: typechecks every package in packages/ (in parallel) and,
 * when the spec dashboard is installed, runs its typecheck and tests — which
 * include the check that specs/*.json tracking files agree with the Markdown
 * specs (feature 004, AC-9).
 *
 * Run after every task: `npm run check`. Exits non-zero if anything fails.
 * Add new gates (unit tests, lint) here so this stays the single command.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const dashboard = join(root, 'tools', 'spec-dashboard');

const run = (name, command, cwd = root) =>
  new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('close', (code) => resolve({ name, ok: code === 0, output }));
  });

const packages = readdirSync(join(root, 'packages')).filter((name) =>
  existsSync(join(root, 'packages', name, 'tsconfig.json')),
);
const jobs = packages.map((name) => run(`typecheck ${name}`, `npx tsc --noEmit -p packages/${name}`));

if (existsSync(join(dashboard, 'node_modules', 'vitest'))) {
  jobs.push(run('spec-dashboard (typecheck, tests, tracking files)', 'npm run check --silent', dashboard));
} else {
  console.log('skip spec-dashboard: not installed (run `npm run dashboard` once, or `npm --prefix tools/spec-dashboard install`)');
}

const results = await Promise.all(jobs);
for (const { name, ok, output } of results) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) console.log(output.trim().replace(/^/gm, '     '));
}

const failed = results.filter((result) => !result.ok).length;
console.log(failed ? `\n${failed} check(s) failed.` : `\nAll ${results.length} checks pass.`);
process.exit(failed ? 1 : 0);

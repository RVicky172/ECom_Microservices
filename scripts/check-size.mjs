#!/usr/bin/env node
/**
 * File-size check (coding standards rule 7): no non-test `.ts`/`.tsx` file under `packages/*\/src` may have more
 * than 300 code lines. Files over the 200-line target are listed as a warning. The rule is in
 * `scripts/lib/sizeCheck.mjs`.
 *
 * Usage: `node scripts/check-size.mjs`. Exits 1 if any file is over the hard limit.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { checkFileSize, HARD_LIMIT, TARGET } from './lib/sizeCheck.mjs';

const root = join(import.meta.dirname, '..');
const isSource = (name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts');

/** Every source file under `dir`, recursively, in a stable order. */
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walk(path);
      return isSource(entry.name) ? [path] : [];
    });

const results = readdirSync(join(root, 'packages'))
  .map((name) => join(root, 'packages', name, 'src'))
  .filter((src) => existsSync(src))
  .flatMap(walk)
  .map((path) => ({ file: relative(root, path).replaceAll('\\', '/'), ...checkFileSize(readFileSync(path, 'utf8')) }));

const overLimit = results.filter((r) => r.overLimit);
const overTarget = results.filter((r) => r.overTarget && !r.overLimit);
for (const r of overLimit) console.log(`${r.file}: ${r.lines} code lines (limit ${HARD_LIMIT}): split it`);
for (const r of overTarget) console.log(`warning ${r.file}: ${r.lines} code lines (target ${TARGET})`);

const largest = results.reduce((a, b) => (b.lines > a.lines ? b : a));
console.log(
  overLimit.length
    ? `\n${overLimit.length} of ${results.length} files over ${HARD_LIMIT} code lines.`
    : `All ${results.length} files within ${HARD_LIMIT} code lines (largest: ${largest.file}, ${largest.lines}).`,
);
process.exit(overLimit.length ? 1 : 0);

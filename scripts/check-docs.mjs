#!/usr/bin/env node
/**
 * JSDoc check (feature 005, AC-10/AC-11): every non-test `.ts`/`.tsx` file under `packages/*\/src` needs a
 * header comment, and every exported declaration a JSDoc block right above it. The rule is in
 * `scripts/lib/docCheck.mjs`.
 *
 * Usage: `node scripts/check-docs.mjs [--package <name>]`. Prints `file:line kind name` per miss and a
 * summary, and exits 1 if anything is missing.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { countExports, findMissingDocs } from './lib/docCheck.mjs';

const root = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = args.indexOf('--package');
const only = flag === -1 ? null : args[flag + 1];
if (flag !== -1 && !only) {
  console.error('usage: check-docs.mjs [--package <name>]');
  process.exit(2);
}

const packages = only ? [only] : readdirSync(join(root, 'packages'));
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

let files = 0;
let filesMissing = 0;
let exportsTotal = 0;
let exportsMissing = 0;
for (const name of packages) {
  const src = join(root, 'packages', name, 'src');
  if (!existsSync(src)) {
    if (only) {
      console.error(`no such package source: packages/${name}/src`);
      process.exit(2);
    }
    continue;
  }
  for (const path of walk(src)) {
    const text = readFileSync(path, 'utf8');
    const missing = findMissingDocs(path, text);
    const file = relative(root, path).replaceAll('\\', '/');
    files += 1;
    exportsTotal += countExports(text);
    for (const { line, kind, name: item } of missing) {
      console.log(`${file}:${line} ${kind} ${item}`);
      if (kind === 'header') filesMissing += 1;
      else exportsMissing += 1;
    }
  }
}

const summary = `${filesMissing} of ${files} files have no header; ${exportsMissing} of ${exportsTotal} exports have no JSDoc`;
console.log(filesMissing + exportsMissing ? `\n${summary}.` : `All documented (${files} files, ${exportsTotal} exports).`);
process.exit(filesMissing + exportsMissing ? 1 : 0);

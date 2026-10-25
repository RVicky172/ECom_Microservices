/**
 * The JSDoc rule behind `npm run check` (feature 005, AC-10/AC-11), as a pure function so it can be unit-tested.
 *
 * Line-based on purpose: TypeScript 7 has no stable compiler API and the constitution rules out a parser
 * dependency. Known blind spot: an export whose declaration line doesn't start with `export` is not seen.
 */
import { basename } from 'node:path';

const exportPattern =
  /^export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(function|class|const|let|var|interface|type|enum)\b\s*\*?\s*([A-Za-z_$][\w$]*|\{[^}]*\}|\[[^\]]*\])?/;

/** The index of the line opening the `/**` block that `lines[index]` closes, or -1 if it closes none. */
const jsDocStart = (lines, index) => {
  if (index < 0 || !lines[index].trim().endsWith('*/')) return -1;
  for (let i = index; i >= 0; i -= 1) {
    const start = lines[i].indexOf('/*');
    if (start === -1) continue;
    return lines[i].startsWith('/**', start) && !lines[i].startsWith('/**/', start) ? i : -1;
  }
  return -1;
};

/**
 * Lists what a source file is missing: a header comment (`kind: 'header'`) and JSDoc on each exported declaration.
 * Re-exports, export lists and `export default <identifier>` are skipped: the declaration they point at is checked.
 *
 * @param {string} path the file's path, used for the header entry's name
 * @param {string} text the file's contents (LF or CRLF)
 * @returns {{ line: number, kind: string, name: string }[]} 1-based lines, in file order
 */
export function findMissingDocs(path, text) {
  const lines = text.split(/\r?\n/);
  const missing = [];

  const first = lines.findIndex((line) => line.trim() !== '');
  const hasHeader = first !== -1 && lines[first].trim().startsWith('/**') && !lines[first].trim().startsWith('/**/');
  if (!hasHeader) {
    missing.push({ line: first === -1 ? 1 : first + 1, kind: 'header', name: basename(path) });
  }

  for (const { index, kind, name } of exportedDeclarations(lines)) {
    const start = jsDocStart(lines, index - 1);
    // The file header doesn't double as the first export's JSDoc.
    if (start !== -1 && !(hasHeader && start === first)) continue;
    missing.push({ line: index + 1, kind, name });
  }

  return missing;
}

/**
 * Counts the exported declarations the rule applies to, so a report can say "N of M".
 *
 * @param {string} text the file's contents (LF or CRLF)
 */
export function countExports(text) {
  return exportedDeclarations(text.split(/\r?\n/)).length;
}

/** The exported declarations in `lines`, skipping `export type { … }` lists (re-exports, not declarations). */
function exportedDeclarations(lines) {
  return lines.flatMap((line, index) => {
    const match = exportPattern.exec(line);
    if (!match) return [];
    const [, kind, name] = match;
    if (kind === 'type' && (!name || name.startsWith('{'))) return [];
    return [{ index, kind, name: name ?? 'default' }];
  });
}

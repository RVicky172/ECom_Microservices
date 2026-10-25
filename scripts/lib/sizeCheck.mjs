/**
 * The file-size rule behind `npm run check` (coding standards rule 7), as pure functions so it can be unit-tested.
 * Only code lines count: blank lines, `//` lines and comment blocks don't, so documenting a file never pushes it
 * over the limit.
 */

/** Code lines a source file should stay within. */
export const TARGET = 200;

/** Code lines a source file may not exceed; past this it must be split. */
export const HARD_LIMIT = 300;

/**
 * Counts the lines that hold code. A line with code and a trailing comment counts; a line inside a comment block
 * doesn't.
 *
 * @param {string} text the file's contents (LF or CRLF)
 */
export function countCodeLines(text) {
  let inBlock = false;
  let lines = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.includes('*/')) inBlock = false;
      continue;
    }
    if (trimmed === '' || trimmed.startsWith('//')) continue;
    if (trimmed.startsWith('/*')) {
      inBlock = !trimmed.includes('*/');
      continue;
    }
    lines += 1;
  }
  return lines;
}

/**
 * Measures a file against the target and the hard limit.
 *
 * @param {string} text the file's contents
 * @returns {{ lines: number, overTarget: boolean, overLimit: boolean }}
 */
export function checkFileSize(text) {
  const lines = countCodeLines(text);
  return { lines, overTarget: lines > TARGET, overLimit: lines > HARD_LIMIT };
}

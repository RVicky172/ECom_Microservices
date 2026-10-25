/**
 * Unit tests for the JSDoc checker (feature 005, AC-11): which files and exports count as documented.
 */
import { describe, expect, it } from 'vitest';
import { countExports, findMissingDocs } from './docCheck.mjs';

const header = '/**\n * What this file is for.\n */\n';
const check = (text) => findMissingDocs('src/example.ts', text);

describe('findMissingDocs — file header', () => {
  it('reports a file with no header', () => {
    expect(check("import x from 'x';\n")).toEqual([{ line: 1, kind: 'header', name: 'example.ts' }]);
  });

  it('accepts a header after blank lines', () => {
    expect(check(`\n\n${header}import x from 'x';\n`)).toEqual([]);
  });

  it('does not count a // comment or a /* block as a header', () => {
    expect(check("// What this file is for.\nimport x from 'x';\n")).toEqual([
      { line: 1, kind: 'header', name: 'example.ts' },
    ]);
    expect(check("/* What this file is for. */\nimport x from 'x';\n")).toEqual([
      { line: 1, kind: 'header', name: 'example.ts' },
    ]);
  });

  it('reports an empty file', () => {
    expect(check('')).toEqual([{ line: 1, kind: 'header', name: 'example.ts' }]);
  });
});

describe('findMissingDocs — exports', () => {
  it('reports each undocumented kind of export with its line and name', () => {
    const text = [
      header.trimEnd(),
      'export function a() {}',
      'export async function b() {}',
      'export const c = 1;',
      'export interface D {}',
      'export type E = string;',
      'export enum F { X }',
      'export class G {}',
      'export abstract class H {}',
      'export default function i() {}',
      'export let j = 1;',
      'export declare const k: number;',
      '',
    ].join('\n');
    expect(check(text)).toEqual([
      { line: 4, kind: 'function', name: 'a' },
      { line: 5, kind: 'function', name: 'b' },
      { line: 6, kind: 'const', name: 'c' },
      { line: 7, kind: 'interface', name: 'D' },
      { line: 8, kind: 'type', name: 'E' },
      { line: 9, kind: 'enum', name: 'F' },
      { line: 10, kind: 'class', name: 'G' },
      { line: 11, kind: 'class', name: 'H' },
      { line: 12, kind: 'function', name: 'i' },
      { line: 13, kind: 'let', name: 'j' },
      { line: 14, kind: 'const', name: 'k' },
    ]);
  });

  it('names a destructured export by its pattern', () => {
    expect(check(`${header}export const { a, b } = slice.actions;\nexport const [c] = pair;\n`)).toEqual([
      { line: 4, kind: 'const', name: '{ a, b }' },
      { line: 5, kind: 'const', name: '[c]' },
    ]);
  });

  it('names an anonymous default export "default"', () => {
    expect(check(`${header}export default function () {}\n`)).toEqual([
      { line: 4, kind: 'function', name: 'default' },
    ]);
  });

  it('reports an undocumented generator function', () => {
    expect(check(`${header}export function* ids() {}\nexport async function *pages() {}\n`)).toEqual([
      { line: 4, kind: 'function', name: 'ids' },
      { line: 5, kind: 'function', name: 'pages' },
    ]);
  });

  it("does not let the file header double as the first export's JSDoc", () => {
    expect(check(`${header}export const a = 1;\n`)).toEqual([{ line: 4, kind: 'const', name: 'a' }]);
  });

  it('accepts exports with a JSDoc block right above (one-line and multi-line)', () => {
    const text = `${header}/** One line. */\nexport const a = 1;\n/**\n * Several lines.\n */\nexport function b() {}\n`;
    expect(check(text)).toEqual([]);
  });

  it('does not count a // comment, a /* block or a blank line in between', () => {
    const text = `${header}// Not JSDoc.\nexport const a = 1;\n/* Not JSDoc. */\nexport const b = 2;\n/** Too far. */\n\nexport const c = 3;\n`;
    expect(check(text)).toEqual([
      { line: 5, kind: 'const', name: 'a' },
      { line: 7, kind: 'const', name: 'b' },
      { line: 10, kind: 'const', name: 'c' },
    ]);
  });

  it('reports a decorator between the comment and the export', () => {
    const text = `${header}/** Documented, but not right above. */\n@Injectable()\nexport class A {}\n`;
    expect(check(text)).toEqual([{ line: 6, kind: 'class', name: 'A' }]);
  });

  it('skips re-exports and export lists', () => {
    const text = [
      header.trimEnd(),
      "export { a, b } from './a';",
      "export * from './b';",
      "export * as c from './c';",
      "export type { D } from './d';",
      'export { e };',
      'export type { F };',
      '',
    ].join('\n');
    expect(check(text)).toEqual([]);
  });

  it('skips `export default <identifier>`', () => {
    expect(check(`${header}export default router;\nexport default App\n`)).toEqual([]);
  });

  it('ignores lines that only mention export', () => {
    expect(check(`${header}const x = 1; // export const y\n  export const indented = 1;\n`)).toEqual([]);
  });
});

describe('countExports', () => {
  it('counts documented and undocumented declarations, not re-exports', () => {
    const text = `${header}/** Documented. */\nexport const a = 1;\nexport function b() {}\nexport { c } from './c';\nexport type { D };\nexport default router;\n`;
    expect(countExports(text)).toBe(2);
  });
});

describe('findMissingDocs — line endings', () => {
  it('handles CRLF files the same as LF', () => {
    const lf = `${header}/** Documented. */\nexport const a = 1;\nexport function b() {}\n`;
    const crlf = lf.replace(/\n/g, '\r\n');
    expect(check(crlf)).toEqual(check(lf));
    expect(check(crlf)).toEqual([{ line: 6, kind: 'function', name: 'b' }]);
  });

  it('accepts a header in a CRLF file', () => {
    expect(check("/**\r\n * Header.\r\n */\r\nimport x from 'x';\r\n")).toEqual([]);
  });
});

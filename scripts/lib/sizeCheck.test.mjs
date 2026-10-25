/**
 * Unit tests for the file-size rule (coding standards rule 7): what counts as a code line, and the limits.
 */
import { describe, expect, it } from 'vitest';
import { checkFileSize, countCodeLines, HARD_LIMIT, TARGET } from './sizeCheck.mjs';

const code = (n) => Array.from({ length: n }, (_, i) => `const v${i} = ${i};`).join('\n');

describe('countCodeLines', () => {
  it('counts code lines only', () => {
    expect(countCodeLines('const a = 1;\nconst b = 2;\n')).toBe(2);
  });

  it('skips blank lines, // lines and comment blocks', () => {
    const text = ['/**', ' * Header.', ' */', '', '// note', '/** One line. */', '/* block */', 'export const a = 1;', '  '].join('\n');
    expect(countCodeLines(text)).toBe(1);
  });

  it('counts a code line that ends with a comment', () => {
    expect(countCodeLines('const a = 1; // why\nconst b = 2; /* why */\n')).toBe(2);
  });

  it('handles CRLF like LF', () => {
    const lf = `/**\n * x\n */\n${code(3)}\n`;
    expect(countCodeLines(lf.replace(/\n/g, '\r\n'))).toBe(countCodeLines(lf));
    expect(countCodeLines(lf)).toBe(3);
  });
});

describe('checkFileSize', () => {
  it('uses the standard limits: target 200, hard limit 300', () => {
    expect(TARGET).toBe(200);
    expect(HARD_LIMIT).toBe(300);
  });

  it('passes a file at the hard limit and fails one line over it', () => {
    expect(checkFileSize(code(300))).toEqual({ lines: 300, overTarget: true, overLimit: false });
    expect(checkFileSize(code(301))).toEqual({ lines: 301, overTarget: true, overLimit: true });
  });

  it('flags a file over the target without failing it', () => {
    expect(checkFileSize(code(200))).toEqual({ lines: 200, overTarget: false, overLimit: false });
    expect(checkFileSize(code(201))).toEqual({ lines: 201, overTarget: true, overLimit: false });
  });

  it('does not count comments towards the limit', () => {
    const commented = `${'// a comment\n'.repeat(500)}${code(10)}`;
    expect(checkFileSize(commented)).toEqual({ lines: 10, overTarget: false, overLimit: false });
  });
});

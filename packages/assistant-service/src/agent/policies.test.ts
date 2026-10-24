import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadPolicies } from './policies';

const dir = mkdtempSync(join(tmpdir(), 'policies-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('loadPolicies', () => {
  it('reads the store policy document with its five sections', () => {
    const text = loadPolicies();
    for (const heading of ['## Returns', '## Shipping', '## Warranty', '## Payment', '## Cancellation and refunds']) {
      expect(text).toContain(heading);
    }
  });

  it('reads the file at a given path as is', () => {
    const path = join(dir, 'custom.md');
    writeFileSync(path, '## Returns\n\n- 45 days.\n');
    expect(loadPolicies(path)).toBe('## Returns\n\n- 45 days.');
  });

  it('throws an error naming the path when the file is missing', () => {
    const path = join(dir, 'missing.md');
    expect(() => loadPolicies(path)).toThrow(path);
  });

  it('throws an error naming the path when the file is empty', () => {
    const path = join(dir, 'empty.md');
    writeFileSync(path, ' \n\n ');
    expect(() => loadPolicies(path)).toThrow(path);
  });
});

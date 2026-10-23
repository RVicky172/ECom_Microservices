/**
 * Runs the consistency check (AC-9) against this repository's real files.
 * Part of the root `npm run check`: it fails when the tracking JSON and the
 * Markdown specs disagree, and lists every mismatch.
 */
import { describe, expect, it } from 'vitest';
import { checkConsistency } from './consistency';
import { loadTrackingFiles } from './repo';

describe('repository tracking files', () => {
  it('specs/*.json agree with the Markdown specs', async () => {
    const problems = checkConsistency(await loadTrackingFiles());
    expect(problems, `Tracking files are out of sync:\n- ${problems.join('\n- ')}`).toEqual([]);
  });
});

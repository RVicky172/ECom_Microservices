import { describe, expect, it } from 'vitest';
import { countByStatus, parseRoadmap, statusFromCell } from './roadmap';

const ROADMAP = `# mercato — Roadmap

> Status legend: ⬜ Not started · 📝 Spec drafted · ✅ Spec approved · 🚧 In progress · ✔️ Done

## Phase 0 — Foundation

_Goal:_ the repo has tests and CI.

| #   | Feature | Spec | Status |
| --- | ------- | ---- | ------ |
| 000 | Baseline: record what exists | — | ✔️ |
| 001 | Test harness: Vitest across \`packages\` | [spec](features/001-test-harness/spec.md) | 🚧 |
| 002 | Ownership checks | — | 📝 |

**Exit criteria:** on a clean clone the gates pass
and CI is green.

## Phase 1 — Checkout & Assistant

_Goal:_ checkout completes.

| #   | Feature | Spec | Status |
| --- | ------- | ---- | ------ |
| 010 | Saga payloads | — | ✅ |
| 011 | Policies | — | ⬜ |
| 012 | Something odd | — | 🤷 |

## Backlog (unscheduled ideas)

- Protect product writes.
- Shared rate limiting.
`;

describe('statusFromCell', () => {
  it('maps every legend emoji', () => {
    expect(statusFromCell('⬜')).toBe('not-started');
    expect(statusFromCell('📝')).toBe('drafted');
    expect(statusFromCell('✅')).toBe('approved');
    expect(statusFromCell('🚧')).toBe('in-progress');
    expect(statusFromCell('✔️')).toBe('done');
  });

  it('accepts done without the variation selector and surrounding spaces', () => {
    expect(statusFromCell(' ✔ ')).toBe('done');
  });

  it('returns unknown for anything else (AC-7)', () => {
    expect(statusFromCell('🤷')).toBe('unknown');
    expect(statusFromCell('')).toBe('unknown');
  });
});

describe('parseRoadmap', () => {
  const roadmap = parseRoadmap(ROADMAP);

  it('finds every phase with its goal and exit criteria (AC-2)', () => {
    expect(roadmap.phases.map((phase) => phase.title)).toEqual(['Phase 0 — Foundation', 'Phase 1 — Checkout & Assistant']);
    expect(roadmap.phases[0].goal).toBe('the repo has tests and CI.');
    expect(roadmap.phases[0].exitCriteria).toBe('on a clean clone the gates pass and CI is green.');
    expect(roadmap.phases[1].exitCriteria).toBeUndefined();
  });

  it('reads feature rows with id, name, spec link and status (AC-2)', () => {
    expect(roadmap.phases[0].features).toEqual([
      { id: '000', name: 'Baseline: record what exists', status: 'done', specLink: undefined },
      {
        id: '001',
        name: 'Test harness: Vitest across `packages`',
        status: 'in-progress',
        specLink: 'features/001-test-harness/spec.md',
      },
      { id: '002', name: 'Ownership checks', status: 'drafted', specLink: undefined },
    ]);
  });

  it('keeps rows with an unknown status instead of failing (AC-7)', () => {
    expect(roadmap.phases[1].features.at(-1)).toMatchObject({ id: '012', status: 'unknown' });
  });

  it('reads the backlog list', () => {
    expect(roadmap.backlog).toEqual(['Protect product writes.', 'Shared rate limiting.']);
  });

  it('counts features per status across phases (AC-2)', () => {
    expect(countByStatus(roadmap)).toEqual({
      'not-started': 1,
      drafted: 1,
      approved: 1,
      'in-progress': 1,
      done: 1,
      unknown: 1,
    });
  });

  it('returns an empty roadmap for empty or missing input (AC-7)', () => {
    expect(parseRoadmap('')).toEqual({ phases: [], backlog: [] });
    expect(parseRoadmap(undefined)).toEqual({ phases: [], backlog: [] });
  });
});

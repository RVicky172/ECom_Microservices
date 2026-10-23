import { describe, expect, it } from 'vitest';
import { parseMemory } from './memory';

const INDEX = `# Project Memory — Index

> Read this first every session.

## Current State (2026-10-23)

- **Phase:** 0 (Foundation).
- **Next step:** \`/spec-new 000-baseline\`.

## Files

- [decisions.md](decisions.md)
`;

const PROGRESS = `# Progress Log

Newest first. One entry per working session.

\`\`\`
## YYYY-MM-DD — <feature id or "chore">
**Done:** …
## 2026-12-31 — example inside a fence, must be ignored
\`\`\`

---

## 2026-10-29 — 004: verify
**Done:** six
## 2026-10-28 — 004: tasks
**Done:** five
## 2026-10-27 — 003
**Done:** four
## 2026-10-26 — 002
**Done:** three
## 2026-10-25 — 001
**Done:** two
## 2026-10-23 — chore: set up
**Done:** one
`;

const DECISIONS = `# Decision Log

Format:

\`\`\`
## D-00X — Title (YYYY-MM-DD)
**Context:** …
\`\`\`

---

## D-001 — Adopt spec-driven development (2026-10-23)

**Context:** Work is done across sessions.

## D-002 — Internal service token, opt-in (2026-10-24)

**Context:** Services trust headers.
`;

const LEARNINGS = `# Learnings & Gotchas

Non-obvious facts.

## Docker & environment

- Rebuild every service after changing .env.

## Assistant / LLM

- Local models write <think> tags.
`;

describe('parseMemory', () => {
  const memory = parseMemory({ index: INDEX, progress: PROGRESS, decisions: DECISIONS, learnings: LEARNINGS });

  it('reads the Current State section with its heading (AC-5)', () => {
    expect(memory.currentState.title).toBe('Current State (2026-10-23)');
    expect(memory.currentState.body).toBe('- **Phase:** 0 (Foundation).\n- **Next step:** `/spec-new 000-baseline`.');
  });

  it('returns the 5 newest progress entries and skips the fenced format example (AC-5)', () => {
    expect(memory.progress.map((entry) => entry.date)).toEqual([
      '2026-10-29',
      '2026-10-28',
      '2026-10-27',
      '2026-10-26',
      '2026-10-25',
    ]);
    expect(memory.progress[0]).toEqual({ date: '2026-10-29', title: '004: verify', body: '**Done:** six' });
  });

  it('reads every decision with id, title and date, skipping the format example (AC-5)', () => {
    expect(memory.decisions.map(({ id, title, date }) => ({ id, title, date }))).toEqual([
      { id: 'D-001', title: 'Adopt spec-driven development', date: '2026-10-23' },
      { id: 'D-002', title: 'Internal service token, opt-in', date: '2026-10-24' },
    ]);
    expect(memory.decisions[1].body).toBe('**Context:** Services trust headers.');
  });

  it('reads learnings grouped by topic (AC-5)', () => {
    expect(memory.learnings).toEqual([
      { topic: 'Docker & environment', body: '- Rebuild every service after changing .env.' },
      { topic: 'Assistant / LLM', body: '- Local models write <think> tags.' },
    ]);
  });

  it('returns empty values for missing files (AC-7)', () => {
    expect(parseMemory({})).toEqual({
      currentState: { title: 'Current State', body: '' },
      progress: [],
      decisions: [],
      learnings: [],
    });
  });
});

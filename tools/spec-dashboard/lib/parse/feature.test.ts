import { describe, expect, it } from 'vitest';
import { parseFeature } from './feature';

const SPEC = `# 004 — Spec Dashboard

**Status:** Approved <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** 0 · **Created:** 2026-10-23 · **Owner:** RVicky172

## Summary

A local web dashboard that shows the state of the workflow.
It reads the committed files.

## User Stories

- **US-1:** As a developer, I want …

## Acceptance Criteria

- [x] **AC-1:** Given the dashboard is started, when I open it,
  then it loads on its own port. _(manual)_
- [ ] **AC-2:** Given a roadmap, when the overview loads, then phases show. _(unit)_
- [X] **AC-3:** Upper-case X counts as ticked.

## Open Questions

- **Q1** Where does it live? _Answer:_ tools/.
- **Q2** [NEEDS CLARIFICATION] How live? _Proposed:_ file watching.

## Changelog

- 2026-10-23 — Created.
`;

const TASKS = `# 004 — Spec Dashboard · Tasks

## Setup

- [x] **T001** — Scaffold the app · files: \`tools/\`
  **Result (2026-10-23):** done.
- [ ] **T010** — Failing tests for the roadmap parser
- [ ] **T011** [P] — Failing tests for the feature parser
`;

describe('parseFeature', () => {
  it('reads title, status (without the template comment) and summary (AC-4)', () => {
    const feature = parseFeature('004-spec-dashboard', { spec: SPEC });
    expect(feature.title).toBe('Spec Dashboard');
    expect(feature.status).toBe('Approved');
    expect(feature.summary).toBe('A local web dashboard that shows the state of the workflow. It reads the committed files.');
  });

  it('reads acceptance criteria with their ticked state, joining wrapped lines (AC-3, AC-4)', () => {
    const { criteria } = parseFeature('004-spec-dashboard', { spec: SPEC });
    expect(criteria).toEqual([
      {
        id: 'AC-1',
        text: 'Given the dashboard is started, when I open it, then it loads on its own port. _(manual)_',
        done: true,
      },
      { id: 'AC-2', text: 'Given a roadmap, when the overview loads, then phases show. _(unit)_', done: false },
      { id: 'AC-3', text: 'Upper-case X counts as ticked.', done: true },
    ]);
  });

  it('lists only open questions still needing clarification (AC-4)', () => {
    const { openQuestions } = parseFeature('004-spec-dashboard', { spec: SPEC });
    expect(openQuestions).toEqual(['**Q2** [NEEDS CLARIFICATION] How live? _Proposed:_ file watching.']);
  });

  it('reads tasks with ids and ticked state, ignoring result notes (AC-3)', () => {
    const { tasks } = parseFeature('004-spec-dashboard', { spec: SPEC, tasks: TASKS });
    expect(tasks.map(({ id, done }) => ({ id, done }))).toEqual([
      { id: 'T001', done: true },
      { id: 'T010', done: false },
      { id: 'T011', done: false },
    ]);
    expect(tasks[0].text).toBe('Scaffold the app · files: `tools/`');
    expect(tasks[2].text).toBe('[P] Failing tests for the feature parser');
  });

  describe('stage (AC-3)', () => {
    it('is spec when only spec.md exists', () => {
      expect(parseFeature('x', { spec: SPEC }).stage).toBe('spec');
    });
    it('is plan when plan.md exists', () => {
      expect(parseFeature('x', { spec: SPEC, plan: '# plan' }).stage).toBe('plan');
    });
    it('is tasks when tasks.md exists with nothing ticked', () => {
      expect(parseFeature('x', { spec: SPEC, plan: '# plan', tasks: '- [ ] **T001** — a' }).stage).toBe('tasks');
    });
    it('is implementing once any task is ticked', () => {
      expect(parseFeature('x', { spec: SPEC, plan: '# plan', tasks: TASKS }).stage).toBe('implementing');
    });
    it('is verified when the spec status is Implemented', () => {
      const implemented = SPEC.replace('**Status:** Approved', '**Status:** Implemented');
      expect(parseFeature('x', { spec: implemented, tasks: TASKS }).stage).toBe('verified');
    });
  });

  it('handles a folder with no spec.md (AC-7)', () => {
    const feature = parseFeature('009-empty', {});
    expect(feature).toMatchObject({ id: '009-empty', title: '009-empty', status: 'Missing spec', stage: 'spec' });
    expect(feature.criteria).toEqual([]);
    expect(feature.tasks).toEqual([]);
  });

  it('falls back to the folder id when the spec has no title (AC-7)', () => {
    expect(parseFeature('010-x', { spec: 'no heading here' }).title).toBe('010-x');
    expect(parseFeature('010-x', { spec: 'no heading here' }).status).toBe('Unknown');
  });
});

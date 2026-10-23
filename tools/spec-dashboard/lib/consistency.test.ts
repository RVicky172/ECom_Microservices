import { describe, expect, it } from 'vitest';
import { checkConsistency, type TrackingFiles } from './consistency';

const ROADMAP_MD = `## Phase 0 — Foundation

| # | Feature | Spec | Status |
| --- | --- | --- | --- |
| 000 | Baseline | — | ⬜ |
| 004 | Spec dashboard | [spec](features/004-spec-dashboard/spec.md) | 🚧 |
`;

const roadmapJson = (overrides: { status004?: string; folder004?: string | null; name000?: string } = {}) =>
  JSON.stringify({
    project: 'mercato',
    updated: '2026-10-23',
    phases: [
      {
        number: 0,
        title: 'Foundation',
        goal: '',
        exitCriteria: '',
        features: [
          { id: '000', name: overrides.name000 ?? 'Baseline', status: 'not-started', folder: null },
          {
            id: '004',
            name: 'Spec dashboard',
            status: overrides.status004 ?? 'in-progress',
            folder: overrides.folder004 === undefined ? '004-spec-dashboard' : overrides.folder004,
          },
        ],
      },
    ],
    backlog: [],
  });

const SPEC_MD = `# 004 — Spec Dashboard

**Status:** In Progress <!-- comment -->

## Acceptance Criteria

- [x] **AC-1:** One.
- [ ] **AC-2:** Two.
`;

const TASKS_MD = `- [x] **T001** — Scaffold
- [ ] **T010** — Tests
`;

const featureJson = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: '004',
    folder: '004-spec-dashboard',
    title: 'Spec Dashboard',
    phase: 0,
    status: 'in-progress',
    stage: 'implementing',
    created: '2026-10-23',
    updated: '2026-10-23',
    summary: '',
    acceptanceCriteria: [
      { id: 'AC-1', text: 'One.', test: 'manual', done: true },
      { id: 'AC-2', text: 'Two.', test: 'unit', done: false },
    ],
    tasks: [
      { id: 'T001', title: 'Scaffold', done: true },
      { id: 'T010', title: 'Tests', done: false },
    ],
    openQuestions: [],
    ...overrides,
  });

const files = (overrides: Partial<TrackingFiles> & { feature?: Partial<TrackingFiles['features'][number]> } = {}): TrackingFiles => ({
  roadmapJson: overrides.roadmapJson ?? roadmapJson(),
  roadmapMd: overrides.roadmapMd ?? ROADMAP_MD,
  features: [
    { folder: '004-spec-dashboard', featureJson: featureJson(), specMd: SPEC_MD, tasksMd: TASKS_MD, ...overrides.feature },
  ],
});

describe('checkConsistency (AC-9)', () => {
  it('passes when JSON and Markdown agree', () => {
    expect(checkConsistency(files())).toEqual([]);
  });

  it('reports an invalid or missing roadmap.json', () => {
    expect(checkConsistency(files({ roadmapJson: '{' }))[0]).toMatch(/^specs\/roadmap.json: invalid JSON/);
    expect(checkConsistency({ ...files(), roadmapJson: undefined })).toEqual(['specs/roadmap.json: file not found']);
  });

  it('reports roadmap status and name drift between roadmap.json and roadmap.md', () => {
    const problems = checkConsistency(files({ roadmapJson: roadmapJson({ status004: 'done', name000: 'Base' }) }));
    expect(problems).toContain('specs/roadmap.md: feature 004 status in-progress ≠ roadmap.json done');
    expect(problems).toContain('specs/roadmap.md: feature 000 name "Baseline" ≠ roadmap.json "Base"');
  });

  it('reports a feature folder without a valid feature.json', () => {
    expect(checkConsistency(files({ feature: { featureJson: undefined } }))).toEqual([
      'specs/features/004-spec-dashboard/feature.json: file not found',
    ]);
  });

  it('reports spec status drift between spec.md and feature.json', () => {
    const problems = checkConsistency(files({ feature: { specMd: SPEC_MD.replace('In Progress', 'Approved') } }));
    expect(problems).toContain('specs/features/004-spec-dashboard: spec.md Status "Approved" ≠ feature.json status "in-progress"');
  });

  it('reports a roadmap status that does not match the feature status', () => {
    const problems = checkConsistency(
      files({ feature: { featureJson: featureJson({ status: 'implemented', stage: 'verified' }), specMd: SPEC_MD.replace('In Progress', 'Implemented') } }),
    );
    expect(problems).toContain('specs/roadmap.json: feature 004 status in-progress ≠ done (spec is implemented)');
  });

  it('reports ticked-state and id drift for acceptance criteria and tasks', () => {
    const problems = checkConsistency(
      files({ feature: { tasksMd: TASKS_MD.replace('- [ ] **T010**', '- [x] **T010**') + '- [ ] **T011** — Extra\n' } }),
    );
    expect(problems).toContain(
      'specs/features/004-spec-dashboard: task T010 is ticked in the Markdown but done=false in feature.json',
    );
    expect(problems).toContain('specs/features/004-spec-dashboard: task T011 is in the Markdown but not in feature.json');
  });

  it('reports a roadmap folder link that does not exist', () => {
    const problems = checkConsistency({ ...files(), features: [] });
    expect(problems).toContain('specs/roadmap.json: feature 004 points to folder 004-spec-dashboard, which does not exist');
  });
});

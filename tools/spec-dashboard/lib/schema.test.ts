import { describe, expect, it } from 'vitest';
import { featureSchema, parseTracking, roadmapSchema } from './schema';

const roadmap = {
  project: 'mercato',
  updated: '2026-10-23',
  phases: [
    {
      number: 0,
      title: 'Foundation',
      goal: 'tests and CI',
      exitCriteria: 'gates pass',
      features: [
        { id: '000', name: 'Baseline', status: 'done', folder: null },
        { id: '004', name: 'Spec dashboard', status: 'in-progress', folder: '004-spec-dashboard' },
      ],
    },
  ],
  backlog: ['Protect product writes'],
};

const feature = {
  id: '004',
  folder: '004-spec-dashboard',
  title: 'Spec Dashboard',
  phase: 0,
  status: 'in-progress',
  stage: 'implementing',
  created: '2026-10-23',
  updated: '2026-10-23',
  summary: 'A dashboard.',
  acceptanceCriteria: [{ id: 'AC-1', text: 'Loads on its own port.', test: 'manual', done: false }],
  tasks: [{ id: 'T001', title: 'Scaffold', done: true, result: 'done' }],
  openQuestions: [{ id: 'Q1', text: 'Where?', resolved: true, answer: 'tools/' }],
};

describe('parseTracking', () => {
  it('accepts valid roadmap and feature files (AC-2, AC-3)', () => {
    expect(parseTracking(roadmapSchema, JSON.stringify(roadmap), 'roadmap.json')).toEqual({ ok: true, data: roadmap });
    expect(parseTracking(featureSchema, JSON.stringify(feature), 'feature.json')).toEqual({ ok: true, data: feature });
  });

  it('reports a missing file instead of throwing (AC-7)', () => {
    expect(parseTracking(roadmapSchema, undefined, 'specs/roadmap.json')).toEqual({
      ok: false,
      file: 'specs/roadmap.json',
      error: 'file not found',
    });
  });

  it('reports malformed JSON with the file name (AC-7)', () => {
    const result = parseTracking(roadmapSchema, '{ "project": ', 'specs/roadmap.json');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/^invalid JSON/);
  });

  it('reports schema problems with their path (AC-7)', () => {
    const broken = { ...feature, stage: 'shipping', tasks: [{ id: 'X1', title: 'x', done: 'yes' }] };
    const result = parseTracking(featureSchema, JSON.stringify(broken), 'feature.json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('stage');
      expect(result.error).toContain('tasks.0.id');
      expect(result.error).toContain('tasks.0.done');
    }
  });

  it('rejects an unknown roadmap status (AC-7)', () => {
    const broken = structuredClone(roadmap);
    (broken.phases[0].features[0] as { status: string }).status = 'shipped';
    expect(parseTracking(roadmapSchema, JSON.stringify(broken), 'roadmap.json').ok).toBe(false);
  });
});

/**
 * Schemas for the tracking files committed next to the specs:
 *
 * - `specs/roadmap.json` — phases, their features and statuses, backlog.
 * - `specs/features/NNN-name/feature.json` — one feature's status, stage,
 *   acceptance criteria, tasks and open questions.
 *
 * These files are the machine-readable tracking state; Markdown holds the
 * prose. `consistency.test.ts` keeps the two in sync.
 */
import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a YYYY-MM-DD date');
const featureNumber = z.string().regex(/^\d{3}$/, 'expected a 3-digit feature number like "004"');

/** Roadmap status of a feature (same meaning as the legend in roadmap.md). */
export const roadmapStatus = z.enum(['not-started', 'drafted', 'approved', 'in-progress', 'done']);
export type RoadmapStatus = z.infer<typeof roadmapStatus>;
export const ROADMAP_STATUSES = roadmapStatus.options;

/** The `**Status:**` of a feature's spec. */
export const specStatus = z.enum(['draft', 'approved', 'in-progress', 'implemented', 'superseded']);
export type SpecStatus = z.infer<typeof specStatus>;

/** Workflow stage: which documents exist and how far implementation has got. */
export const stage = z.enum(['spec', 'plan', 'tasks', 'implementing', 'verified']);
export type Stage = z.infer<typeof stage>;
export const STAGES = stage.options;

export const roadmapFeatureSchema = z.object({
  id: featureNumber,
  name: z.string().min(1),
  status: roadmapStatus,
  /** Feature folder under `specs/features/`, once a spec exists. */
  folder: z.string().regex(/^\d{3}-[a-z0-9-]+$/).nullable(),
});

export const roadmapSchema = z.object({
  project: z.string().min(1),
  updated: date,
  phases: z.array(
    z.object({
      number: z.number().int().min(0),
      title: z.string().min(1),
      goal: z.string(),
      exitCriteria: z.string(),
      features: z.array(roadmapFeatureSchema),
    }),
  ),
  backlog: z.array(z.string()),
});
export type Roadmap = z.infer<typeof roadmapSchema>;
export type RoadmapFeature = z.infer<typeof roadmapFeatureSchema>;

const criterionSchema = z.object({
  id: z.string().regex(/^AC-\d+$/),
  text: z.string().min(1),
  /** How it is proven, e.g. "unit", "manual". */
  test: z.string().min(1),
  done: z.boolean(),
});

const taskSchema = z.object({
  id: z.string().regex(/^T\d{3}$/),
  title: z.string().min(1),
  done: z.boolean(),
  /** Short evidence note once done (mirrors the task's "Result" note in tasks.md). */
  result: z.string().optional(),
});

const questionSchema = z.object({
  id: z.string().regex(/^Q\d+$/),
  text: z.string().min(1),
  resolved: z.boolean(),
  answer: z.string().optional(),
});

export const featureSchema = z.object({
  id: featureNumber,
  folder: z.string().regex(/^\d{3}-[a-z0-9-]+$/),
  title: z.string().min(1),
  phase: z.number().int().min(0),
  status: specStatus,
  stage,
  created: date,
  updated: date,
  summary: z.string(),
  acceptanceCriteria: z.array(criterionSchema),
  tasks: z.array(taskSchema),
  openQuestions: z.array(questionSchema),
});
export type Feature = z.infer<typeof featureSchema>;

/** Result of reading one tracking file: the data, or a message naming what is wrong. */
export type Loaded<T> = { ok: true; data: T } | { ok: false; file: string; error: string };

/** Parses JSON text against a schema without throwing (AC-7). */
export const parseTracking = <T>(schema: z.ZodType<T>, text: string | undefined, file: string): Loaded<T> => {
  if (text === undefined) return { ok: false, file, error: 'file not found' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, file, error: `invalid JSON: ${(error as Error).message}` };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return { ok: false, file, error: issues };
  }
  return { ok: true, data: result.data };
};

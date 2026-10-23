/**
 * Parses one feature folder (`specs/features/NNN-name/`): its spec status,
 * summary, acceptance criteria, open questions and tasks, and works out which
 * workflow stage it is in.
 */
import { checkboxes, findSection, oneLine, type Checkbox } from './markdown';

export type Stage = 'spec' | 'plan' | 'tasks' | 'implementing' | 'verified';

export const STAGES: Stage[] = ['spec', 'plan', 'tasks', 'implementing', 'verified'];

export interface FeatureFiles {
  spec?: string;
  plan?: string;
  tasks?: string;
}

export interface Feature {
  /** Folder name, e.g. `004-spec-dashboard`. */
  id: string;
  title: string;
  /** Spec `Status:` value, e.g. `Approved`; `Missing spec` / `Unknown` when it can't be read. */
  status: string;
  stage: Stage;
  summary: string;
  criteria: Checkbox[];
  tasks: Checkbox[];
  /** Open questions still marked `[NEEDS CLARIFICATION]`. */
  openQuestions: string[];
  files: FeatureFiles;
}

const readTitle = (spec: string, fallback: string): string => {
  const heading = /^# (.+)$/m.exec(spec)?.[1]?.trim();
  if (!heading) return fallback;
  return heading.replace(/^\d{3}\s*[—–-]\s*/, '') || fallback;
};

const readStatus = (spec: string): string => {
  const match = /^\*\*Status:\*\*\s*(.*)$/m.exec(spec);
  if (!match) return 'Unknown';
  return match[1].replace(/<!--[\s\S]*?-->/g, '').trim() || 'Unknown';
};

/** A task's text without the separator after its id: "— Do x" → "Do x", "[P] — Do x" → "[P] Do x". */
const cleanTaskText = (text: string): string => text.replace(/^(\[P\]\s*)?[—–-]\s*/, '$1').trim();

const stageOf = (status: string, files: FeatureFiles, tasks: Checkbox[]): Stage => {
  if (/^implemented\b/i.test(status)) return 'verified';
  if (files.tasks !== undefined) return tasks.some((task) => task.done) ? 'implementing' : 'tasks';
  if (files.plan !== undefined) return 'plan';
  return 'spec';
};

export const parseFeature = (id: string, files: FeatureFiles): Feature => {
  const spec = files.spec ?? '';
  const status = files.spec === undefined ? 'Missing spec' : readStatus(spec);
  const tasks = checkboxes(files.tasks ?? '', 'T\\d+').map((task) => ({ ...task, text: cleanTaskText(task.text) }));
  const questions = findSection(spec, 2, 'Open Questions')?.body ?? '';

  return {
    id,
    title: readTitle(spec, id),
    status,
    stage: stageOf(status, files, tasks),
    summary: oneLine(findSection(spec, 2, 'Summary')?.body.split(/\n\s*\n/)[0] ?? ''),
    criteria: checkboxes(spec, 'AC-\\d+'),
    tasks,
    openQuestions: questions
      .split(/\r?\n/)
      .filter((line) => /^\s*[-*] /.test(line) && line.includes('[NEEDS CLARIFICATION]'))
      .map((line) => line.replace(/^\s*[-*] /, '').trim()),
    files,
  };
};

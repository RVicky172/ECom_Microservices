/**
 * Parses the project memory in `memory/`: the current state from MEMORY.md,
 * recent progress entries, the decision log and learnings.
 */
import { findSection, sections, stripFences } from './markdown';

export interface MemoryFiles {
  index?: string;
  progress?: string;
  decisions?: string;
  learnings?: string;
}

export interface ProgressEntry {
  date: string;
  title: string;
  body: string;
}

export interface Decision {
  id: string;
  title: string;
  date: string;
  body: string;
}

export interface Learning {
  topic: string;
  body: string;
}

export interface Memory {
  currentState: { title: string; body: string };
  /** Newest first, at most {@link PROGRESS_LIMIT}. */
  progress: ProgressEntry[];
  decisions: Decision[];
  learnings: Learning[];
}

export const PROGRESS_LIMIT = 5;

const DASH = '\\s+[—–-]\\s+';

export const parseMemory = (files: MemoryFiles): Memory => {
  const current = findSection(files.index ?? '', 2, 'Current State');

  const progressPattern = new RegExp(`^(\\d{4}-\\d{2}-\\d{2})${DASH}(.+)$`);
  const progress = sections(stripFences(files.progress ?? ''), 2)
    .map(({ heading, body }) => {
      const match = progressPattern.exec(heading);
      return match ? { date: match[1], title: match[2].trim(), body } : null;
    })
    .filter((entry): entry is ProgressEntry => entry !== null)
    .sort((a, b) => b.date.localeCompare(a.date)) // stable: same-day entries keep file order
    .slice(0, PROGRESS_LIMIT);

  const decisionPattern = new RegExp(`^(D-\\d+)${DASH}(.+?)\\s*\\((\\d{4}-\\d{2}-\\d{2})\\)\\s*$`);
  const decisions = sections(stripFences(files.decisions ?? ''), 2)
    .map(({ heading, body }) => {
      const match = decisionPattern.exec(heading);
      return match ? { id: match[1], title: match[2].trim(), date: match[3], body } : null;
    })
    .filter((decision): decision is Decision => decision !== null);

  const learnings = sections(stripFences(files.learnings ?? ''), 2).map(({ heading, body }) => ({ topic: heading, body }));

  return {
    currentState: { title: current?.heading ?? 'Current State', body: current?.body ?? '' },
    progress,
    decisions,
    learnings,
  };
};

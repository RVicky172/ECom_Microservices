/**
 * Parses `specs/roadmap.md`: phases (`## Phase …`) with their goal, exit
 * criteria and feature table, plus the backlog list.
 */
import { oneLine, sections } from './markdown';

export type RoadmapStatus = 'not-started' | 'drafted' | 'approved' | 'in-progress' | 'done' | 'unknown';

export const ROADMAP_STATUSES: RoadmapStatus[] = ['not-started', 'drafted', 'approved', 'in-progress', 'done', 'unknown'];

export interface RoadmapFeature {
  id: string;
  name: string;
  status: RoadmapStatus;
  /** Link from the Spec column, relative to `specs/`, if any. */
  specLink?: string;
}

export interface Phase {
  title: string;
  goal?: string;
  exitCriteria?: string;
  features: RoadmapFeature[];
}

export interface Roadmap {
  phases: Phase[];
  backlog: string[];
}

/** Maps a status cell (the roadmap legend's emoji) to a status; anything unrecognised is `unknown`. */
export const statusFromCell = (cell: string): RoadmapStatus => {
  const symbol = cell.replace(/️/g, '').trim(); // drop the emoji variation selector
  switch (symbol) {
    case '⬜':
      return 'not-started';
    case '📝':
      return 'drafted';
    case '✅':
      return 'approved';
    case '🚧':
      return 'in-progress';
    case '✔':
      return 'done';
    default:
      return 'unknown';
  }
};

const tableRow = (line: string): RoadmapFeature | null => {
  if (!line.trim().startsWith('|')) return null;
  const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
  if (cells.length < 4 || !/^\d{3}$/.test(cells[0])) return null;
  const link = /\]\(([^)]+)\)/.exec(cells[2]);
  return { id: cells[0], name: cells[1], status: statusFromCell(cells[3]), specLink: link?.[1] };
};

/** A `**Label:** text` paragraph, joined onto one line; undefined if absent. */
const labelled = (body: string, label: RegExp): string | undefined => {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => label.test(line));
  if (start === -1) return undefined;
  const paragraph = [lines[start].replace(label, '')];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim() || line.trim().startsWith('|') || line.startsWith('#')) break;
    paragraph.push(line);
  }
  return oneLine(paragraph.join('\n')) || undefined;
};

export const parseRoadmap = (markdown: string | undefined): Roadmap => {
  const roadmap: Roadmap = { phases: [], backlog: [] };
  for (const { heading, body } of sections(markdown ?? '', 2)) {
    if (/^phase\b/i.test(heading)) {
      roadmap.phases.push({
        title: heading,
        goal: labelled(body, /^\s*_Goal:_\s*/),
        exitCriteria: labelled(body, /^\s*\*\*Exit criteria:\*\*\s*/),
        features: body.split(/\r?\n/).map(tableRow).filter((row): row is RoadmapFeature => row !== null),
      });
    } else if (/^backlog\b/i.test(heading)) {
      roadmap.backlog = body
        .split(/\r?\n/)
        .filter((line) => /^\s*[-*] /.test(line))
        .map((line) => line.replace(/^\s*[-*] /, '').trim())
        .filter((item) => item && item !== '…');
    }
  }
  return roadmap;
};

/** How many features have each status, across all phases. */
export const countByStatus = (roadmap: Roadmap): Record<RoadmapStatus, number> => {
  const counts = Object.fromEntries(ROADMAP_STATUSES.map((status) => [status, 0])) as Record<RoadmapStatus, number>;
  for (const phase of roadmap.phases) {
    for (const feature of phase.features) counts[feature.status] += 1;
  }
  return counts;
};

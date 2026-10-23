/**
 * Keeps the JSON tracking files and the Markdown documents in agreement (AC-9).
 *
 * Returns a list of human-readable problems; empty means everything matches.
 * Pure: callers pass file contents in, so it is easy to test.
 */
import { parseFeature as parseFeatureMarkdown } from './parse/feature';
import { parseRoadmap as parseRoadmapMarkdown } from './parse/roadmap';
import { featureSchema, parseTracking, roadmapSchema, type RoadmapStatus, type SpecStatus } from './schema';

export interface FeatureFolderFiles {
  folder: string;
  featureJson?: string;
  specMd?: string;
  tasksMd?: string;
}

export interface TrackingFiles {
  roadmapJson?: string;
  roadmapMd?: string;
  features: FeatureFolderFiles[];
}

/** Which roadmap status each spec status implies (superseded features may show anything). */
const ROADMAP_STATUS_FOR: Record<Exclude<SpecStatus, 'superseded'>, RoadmapStatus> = {
  draft: 'drafted',
  approved: 'approved',
  'in-progress': 'in-progress',
  implemented: 'done',
};

/** "In Progress" → "in-progress", as used in feature.json. */
const normaliseSpecStatus = (status: string): string => status.trim().toLowerCase().replace(/\s+/g, '-');

const compareChecklists = (
  problems: string[],
  where: string,
  kind: string,
  json: { id: string; done: boolean }[],
  markdown: { id: string; done: boolean }[],
): void => {
  const fromJson = new Map(json.map((item) => [item.id, item.done]));
  const fromMarkdown = new Map(markdown.map((item) => [item.id, item.done]));
  for (const [id, done] of fromMarkdown) {
    if (!fromJson.has(id)) problems.push(`${where}: ${kind} ${id} is in the Markdown but not in feature.json`);
    else if (fromJson.get(id) !== done) {
      problems.push(`${where}: ${kind} ${id} is ${done ? 'ticked' : 'not ticked'} in the Markdown but done=${fromJson.get(id)} in feature.json`);
    }
  }
  for (const id of fromJson.keys()) {
    if (!fromMarkdown.has(id)) problems.push(`${where}: ${kind} ${id} is in feature.json but not in the Markdown`);
  }
};

export const checkConsistency = (files: TrackingFiles): string[] => {
  const problems: string[] = [];

  const roadmapResult = parseTracking(roadmapSchema, files.roadmapJson, 'specs/roadmap.json');
  if (!roadmapResult.ok) return [`${roadmapResult.file}: ${roadmapResult.error}`];
  const roadmap = roadmapResult.data;

  // roadmap.json ↔ roadmap.md: same features, names and statuses.
  const jsonFeatures = roadmap.phases.flatMap((phase) => phase.features);
  const mdFeatures = new Map(
    parseRoadmapMarkdown(files.roadmapMd).phases.flatMap((phase) => phase.features).map((feature) => [feature.id, feature]),
  );
  for (const feature of jsonFeatures) {
    const md = mdFeatures.get(feature.id);
    if (!md) {
      problems.push(`specs/roadmap.md: feature ${feature.id} is in roadmap.json but has no row in roadmap.md`);
      continue;
    }
    if (md.name !== feature.name) problems.push(`specs/roadmap.md: feature ${feature.id} name "${md.name}" ≠ roadmap.json "${feature.name}"`);
    if (md.status !== feature.status) problems.push(`specs/roadmap.md: feature ${feature.id} status ${md.status} ≠ roadmap.json ${feature.status}`);
  }
  for (const id of mdFeatures.keys()) {
    if (!jsonFeatures.some((feature) => feature.id === id)) problems.push(`specs/roadmap.json: feature ${id} is in roadmap.md but not in roadmap.json`);
  }

  // Each feature folder: valid feature.json that matches spec.md, tasks.md and the roadmap.
  const folders = new Set(files.features.map((feature) => feature.folder));
  for (const feature of jsonFeatures) {
    if (feature.folder && !folders.has(feature.folder)) {
      problems.push(`specs/roadmap.json: feature ${feature.id} points to folder ${feature.folder}, which does not exist`);
    }
  }

  for (const folderFiles of files.features) {
    const where = `specs/features/${folderFiles.folder}`;
    const loaded = parseTracking(featureSchema, folderFiles.featureJson, `${where}/feature.json`);
    if (!loaded.ok) {
      problems.push(`${loaded.file}: ${loaded.error}`);
      continue;
    }
    const json = loaded.data;

    if (json.folder !== folderFiles.folder) problems.push(`${where}/feature.json: folder "${json.folder}" ≠ actual folder`);
    if (json.id !== folderFiles.folder.slice(0, 3)) problems.push(`${where}/feature.json: id "${json.id}" ≠ folder number`);

    const roadmapEntry = jsonFeatures.find((entry) => entry.id === json.id);
    if (!roadmapEntry) {
      problems.push(`specs/roadmap.json: feature ${json.id} has a folder but is not on the roadmap`);
    } else {
      if (roadmapEntry.folder !== folderFiles.folder) {
        problems.push(`specs/roadmap.json: feature ${json.id} folder is ${roadmapEntry.folder ?? 'null'}, expected "${folderFiles.folder}"`);
      }
      if (json.status !== 'superseded' && roadmapEntry.status !== ROADMAP_STATUS_FOR[json.status]) {
        problems.push(`specs/roadmap.json: feature ${json.id} status ${roadmapEntry.status} ≠ ${ROADMAP_STATUS_FOR[json.status]} (spec is ${json.status})`);
      }
    }

    const markdown = parseFeatureMarkdown(folderFiles.folder, { spec: folderFiles.specMd, tasks: folderFiles.tasksMd });
    if (folderFiles.specMd === undefined) {
      problems.push(`${where}: spec.md is missing`);
    } else if (normaliseSpecStatus(markdown.status) !== json.status) {
      problems.push(`${where}: spec.md Status "${markdown.status}" ≠ feature.json status "${json.status}"`);
    }
    compareChecklists(problems, where, 'acceptance criterion', json.acceptanceCriteria, markdown.criteria);
    compareChecklists(problems, where, 'task', json.tasks, markdown.tasks);
  }

  return problems;
};

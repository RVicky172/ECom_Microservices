/**
 * Read-only access to the repository's `specs/` and `memory/` folders.
 *
 * Tracking state comes from the JSON files (`specs/roadmap.json`, each
 * feature's `feature.json`); Markdown documents are read only to display them
 * and to check consistency. Only fixed file names and feature folders found by
 * listing `specs/features/` are read, so a URL can't reach other files.
 * Nothing here writes to disk.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { TrackingFiles } from './consistency';
import { parseMemory, type Memory } from './parse/memory';
import { featureSchema, parseTracking, roadmapSchema, type Feature, type Loaded, type Roadmap } from './schema';

/** Repository root: two levels above this app, unless `SPEC_DASHBOARD_ROOT` says otherwise. */
// Read at runtime from the developer's checkout; nothing here should be traced into the build output.
export const REPO_ROOT = path.resolve(
  /*turbopackIgnore: true*/ process.env.SPEC_DASHBOARD_ROOT ?? path.join(/*turbopackIgnore: true*/ process.cwd(), '..', '..'),
);
export const SPECS_DIR = path.join(REPO_ROOT, 'specs');
export const MEMORY_DIR = path.join(REPO_ROOT, 'memory');
const FEATURES_DIR = path.join(SPECS_DIR, 'features');

/** Feature folder names look like `004-spec-dashboard`. */
const FEATURE_FOLDER = /^\d{3}-[a-z0-9-]+$/;

/** File contents, or `undefined` if it doesn't exist or can't be read. */
const readOptional = (file: string): Promise<string | undefined> => fs.readFile(file, 'utf8').catch(() => undefined);

const featureFile = (folder: string, name: string): string => path.join(FEATURES_DIR, folder, name);

export const listFeatureFolders = async (): Promise<string[]> => {
  const entries = await fs.readdir(FEATURES_DIR, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && FEATURE_FOLDER.test(entry.name))
    .map((entry) => entry.name)
    .sort();
};

export const loadRoadmap = async (): Promise<Loaded<Roadmap>> =>
  parseTracking(roadmapSchema, await readOptional(path.join(SPECS_DIR, 'roadmap.json')), 'specs/roadmap.json');

const readFeatureJson = async (folder: string): Promise<Loaded<Feature>> =>
  parseTracking(featureSchema, await readOptional(featureFile(folder, 'feature.json')), `specs/features/${folder}/feature.json`);

/** Every feature folder with its parsed `feature.json` (or the problem reading it). */
export const loadFeatures = async (): Promise<{ folder: string; feature: Loaded<Feature> }[]> => {
  const folders = await listFeatureFolders();
  return Promise.all(folders.map(async (folder) => ({ folder, feature: await readFeatureJson(folder) })));
};

export interface FeatureDetail {
  folder: string;
  feature: Loaded<Feature>;
  documents: { spec?: string; plan?: string; tasks?: string };
}

/** One feature folder, or `null` if the name is malformed or no such folder exists. */
export const loadFeature = async (folder: string): Promise<FeatureDetail | null> => {
  if (!FEATURE_FOLDER.test(folder) || !(await listFeatureFolders()).includes(folder)) return null;
  const [feature, spec, plan, tasks] = await Promise.all([
    readFeatureJson(folder),
    readOptional(featureFile(folder, 'spec.md')),
    readOptional(featureFile(folder, 'plan.md')),
    readOptional(featureFile(folder, 'tasks.md')),
  ]);
  return { folder, feature, documents: { spec, plan, tasks } };
};

export const loadMemory = async (): Promise<Memory> => {
  const [index, progress, decisions, learnings] = await Promise.all(
    ['MEMORY.md', 'progress.md', 'decisions.md', 'learnings.md'].map((file) => readOptional(path.join(MEMORY_DIR, file))),
  );
  return parseMemory({ index, progress, decisions, learnings });
};

/** Everything the consistency check compares (AC-9). */
export const loadTrackingFiles = async (): Promise<TrackingFiles> => {
  const folders = await listFeatureFolders();
  return {
    roadmapJson: await readOptional(path.join(SPECS_DIR, 'roadmap.json')),
    roadmapMd: await readOptional(path.join(SPECS_DIR, 'roadmap.md')),
    features: await Promise.all(
      folders.map(async (folder) => ({
        folder,
        featureJson: await readOptional(featureFile(folder, 'feature.json')),
        specMd: await readOptional(featureFile(folder, 'spec.md')),
        tasksMd: await readOptional(featureFile(folder, 'tasks.md')),
      })),
    ),
  };
};

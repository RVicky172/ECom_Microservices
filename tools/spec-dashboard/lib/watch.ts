/**
 * Watches `specs/` and `memory/` and notifies subscribers (open pages, via
 * `/api/events`) when anything changes.
 *
 * One set of watchers is shared by all subscribers and kept on `globalThis`,
 * so dev-mode module reloads don't open duplicates. Bursts of events (editors
 * often write a file several times) are debounced into one notification.
 */
import { watch, type FSWatcher } from 'node:fs';
import { MEMORY_DIR, SPECS_DIR } from './repo';

const DEBOUNCE_MS = 300;

type Listener = () => void;

interface WatchState {
  listeners: Set<Listener>;
  watchers: FSWatcher[];
  timer?: ReturnType<typeof setTimeout>;
}

const globalState = globalThis as typeof globalThis & { __specDashboardWatch?: WatchState };
const state: WatchState = (globalState.__specDashboardWatch ??= { listeners: new Set(), watchers: [] });

const notifySoon = (): void => {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => state.listeners.forEach((listener) => listener()), DEBOUNCE_MS);
};

const ensureWatching = (): void => {
  if (state.watchers.length > 0) return;
  for (const dir of [SPECS_DIR, MEMORY_DIR]) {
    try {
      const watcher = watch(dir, { recursive: true }, notifySoon);
      watcher.on('error', (error) => console.warn(`spec-dashboard: stopped watching ${dir}:`, error.message));
      state.watchers.push(watcher);
    } catch (error) {
      console.warn(`spec-dashboard: cannot watch ${dir}; pages will need a manual reload.`, (error as Error).message);
    }
  }
};

/** Calls `listener` after files change. Returns the unsubscribe function. */
export const subscribe = (listener: Listener): (() => void) => {
  ensureWatching();
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
};

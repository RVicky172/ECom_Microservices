/**
 * The store's written policies (returns, shipping, warranty, payment,
 * cancellation), which the assistant answers policy questions from.
 *
 * The document lives in `policies/store-policies.md` at the package root, so it
 * resolves the same from `src/agent` (ts-node) and `dist/agent` (built).
 * Editing it and restarting the service changes the answers.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

export const DEFAULT_POLICIES_PATH = join(__dirname, '..', '..', 'policies', 'store-policies.md');

/** Reads the policy document. A missing or empty file throws, which stops the service at startup. */
export const loadPolicies = (path: string = DEFAULT_POLICIES_PATH): string => {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`Store policy document not readable at ${path}: ${(error as Error).message}`);
  }
  text = text.trim();
  if (!text) throw new Error(`Store policy document is empty: ${path}`);
  return text;
};

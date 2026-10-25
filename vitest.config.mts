/**
 * Unit tests for every package (feature 001): `npm test`, also run by `npm run check`.
 *
 * One Vitest project per directory in packages/, so a new `src/**\/*.test.ts` file — or a new
 * package — is picked up with no config change. Tests import `@ecommerce/shared` from its source,
 * so they run without building it first. The spec dashboard (tools/) keeps its own config.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;
const packages = readdirSync(join(root, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

export default defineConfig({
  resolve: {
    alias: { '@ecommerce/shared': join(root, 'packages', 'shared', 'src', 'index.ts') },
  },
  test: {
    // List every test file, pass or fail, also when output is not a terminal (AC-1).
    reporters: [['default', { summary: false }]],
    projects: [
      ...packages.map((name) => ({
        extends: true,
        test: {
          name,
          root: join(root, 'packages', name),
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      })),
      // The repo's own tooling, e.g. the JSDoc checker (feature 005).
      {
        extends: true,
        test: { name: 'scripts', root: join(root, 'scripts'), include: ['**/*.test.mjs'], environment: 'node' },
      },
    ],
  },
});

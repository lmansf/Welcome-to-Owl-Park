import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';

/**
 * The playtest's runs (bots/README.md), picked by PLAYTEST: the room shards side by side (pnpm playtest),
 * then the verdict over them (verdict); or the plan the browser walk reads (plan).
 */
const MODE = process.env['PLAYTEST'] ?? 'rooms';
const FILES: Record<string, string> = { rooms: 'playtest/*.playtest.ts', verdict: 'playtest/*.verdict.ts', plan: 'playtest/*.plan.ts' };

export default defineConfig({
  test: {
    include: [FILES[MODE] ?? FILES['rooms']!],
    testTimeout: 30 * 60_000,
    pool: 'forks',
    maxWorkers: Math.max(1, availableParallelism()),
    fileParallelism: true,
  },
});

#!/usr/bin/env node
/**
 * build-edge.mjs: builds the client for the room server, `pnpm build` with VITE_TRANSPORT=edge
 * (`pnpm build:edge`, which `pnpm deploy:edge` runs first). Written as `VITE_TRANSPORT=edge pnpm build`
 * the script ran only in a POSIX shell; this runs the same in PowerShell or the Command Prompt.
 *
 *   node tools/build-edge.mjs
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Through a shell on every system: on Windows pnpm is pnpm.cmd, which only a shell can start.
const run = spawnSync('pnpm build', {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, VITE_TRANSPORT: 'edge' },
});
process.exit(run.status ?? 1);

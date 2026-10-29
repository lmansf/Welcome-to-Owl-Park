// The shared tests under Stryker (OP-131): each function it mutates asks which mutant is live on every
// call, so the climb's scripted runs take several times as long as under `vitest run`. A test gets a
// minute here; the suite itself still runs with vitest's defaults.
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { testTimeout: 60_000 } });

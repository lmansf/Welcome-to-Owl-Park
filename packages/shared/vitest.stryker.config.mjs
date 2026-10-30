// The shared tests under Stryker (OP-131): each function it mutates asks which mutant is live on every
// call, so the climb's scripted runs take several times as long as under `vitest run`. A test gets a
// minute here; the suite itself still runs with vitest's defaults. `mutationRun` tells a test it runs
// here, for a sweep too long to run whole under Stryker (wayAround.test.ts) to take a sample instead.
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { testTimeout: 60_000, provide: { mutationRun: true } } });

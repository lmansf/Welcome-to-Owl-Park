// @ts-check
/**
 * What the two packages' Stryker configs share (OP-131): the mutators, the reports and the shards. A
 * package's files are split into shards that CI runs side by side; MUTATION_SHARD names the one to run
 * (unset, all of them), and each shard keeps its own incremental file and report under
 * reports/<shard>, so its next run tests only what changed in it.
 *
 * Scores are judged by CI's report over a scope's shards together (tools/mutation/summary.mjs
 * --break): under 50 the run fails now, 70 after two weeks, 80 by the preview. Never chase 100.
 */
import { readFileSync } from 'node:fs';

/**
 * A function's lines as Stryker's `file:from-to`, found by its name so the range follows edits; a
 * missing name stops the run. `root` is the package's own URL (the config's `new URL('./', import.meta.url)`).
 * @param {URL} root
 * @param {string} file
 * @param {string} name
 */
export function linesOf(root, file, name) {
  const lines = readFileSync(new URL(file, root), 'utf8').split('\n');
  const from = lines.findIndex((l) => new RegExp(`^(async )?function ${name}\\(`).test(l));
  const to = lines.findIndex((l, i) => i > from && l === '}');
  if (from < 0 || to < 0) throw new Error(`stryker.config.mjs: ${file} has no function ${name} any more; update the mutate list.`);
  return `${file}:${from + 1}-${to + 1}`;
}

/**
 * A file cut into pieces for shards, as Stryker's `file:from-to`: the lines up to the first marker's,
 * from it up to the next one's, and so on to the end. A marker is how a line begins (a comment that
 * stays put as the file is edited), found in order; a missing one stops the run. A mutant whose code
 * reaches across a cut, a block around it emptied whole, is in no piece.
 * @param {URL} root
 * @param {string} file
 * @param {string[]} markers
 * @returns {string[]}
 */
export function piecesOf(root, file, markers) {
  const lines = readFileSync(new URL(file, root), 'utf8').split('\n');
  const starts = [1];
  for (const marker of markers) {
    const after = starts[starts.length - 1];
    const at = lines.findIndex((l, i) => i + 1 > after && l.trimStart().startsWith(marker));
    if (at < 0) throw new Error(`stryker.config.mjs: ${file} has no line ${marker} after line ${after} any more; update the shards.`);
    starts.push(at + 1);
  }
  return starts.map((from, i) => `${file}:${from}-${i + 1 < starts.length ? starts[i + 1] - 1 : lines.length}`);
}

/**
 * A package's Stryker options for the shard MUTATION_SHARD names.
 * @param {Record<string, string[]>} shards the package's files to mutate, by shard
 * @param {import('@stryker-mutator/api/core').PartialStrykerOptions} own the package's own options (its plugins, found from it)
 * @returns {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export function strykerOptions(shards, own) {
  const shard = process.env['MUTATION_SHARD'] || undefined;
  if (shard !== undefined && !Object.hasOwn(shards, shard)) throw new Error(`MUTATION_SHARD=${shard} is not one of this package's shards (${Object.keys(shards).join(', ')}).`);
  const dir = shard ? `reports/${shard}` : 'reports';
  return {
    packageManager: 'pnpm',
    testRunner: 'vitest',
    checkers: ['typescript'],
    tsconfigFile: 'tsconfig.json',
    mutate: shard ? shards[shard] : Object.values(shards).flat(),
    // A constant's own value (a table of numbers) is tested where it is used, not mutated alone.
    ignoreStatic: true,
    // Messages and object shapes are the costly mutators with the fewest real bugs: out until the score is steady.
    mutator: { excludedMutations: ['StringLiteral', 'ObjectLiteral'] },
    incremental: true,
    incrementalFile: `${dir}/stryker-incremental.json`,
    // Every shard's reports stay out of the sandbox, not only this run's own.
    ignorePatterns: ['/reports'],
    reporters: ['clear-text', 'progress', 'html', 'json'],
    htmlReporter: { fileName: `${dir}/mutation/index.html` },
    jsonReporter: { fileName: `${dir}/mutation/mutation.json` },
    // The break threshold is CI's report's, over a scope's shards together.
    thresholds: { high: 80, low: 60, break: null },
    // A GitHub runner's four cores, and this machine's.
    concurrency: 4,
    timeoutMS: 30_000,
    // Each run makes a sandbox of its own in .stryker-tmp, so two shards can run on one machine at once.
    // A folder a shard would put the sandbox deeper than Stryker allows for when it points tsconfig.json's
    // `extends` back at the repository, and no test would load.
    cleanTempDir: 'always',
    ...own,
  };
}

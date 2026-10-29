// @ts-check
/**
 * Mutation testing for the shared rules (OP-131): Stryker changes the code in small ways (a < for a
 * <=, a deleted return, || for &&) and runs the unit tests; a change no test notices is a line the
 * tests do not really check. Run with `pnpm --filter @owl-park/shared mutate` (MUTATION_SHARD=climb or
 * rules for one shard); the report lands in reports/mutation (index.html, mutation.json), and
 * reports/stryker-incremental.json lets the next run test only what changed. What both packages'
 * configs share is in tools/mutation/stryker.mjs.
 *
 * In scope, by value (the ticket's order): the climb's and the flight's simulation, walking and its
 * targets, quest state, the collection book's grants and the shop, the arcade's payouts, and the
 * checks on what a page sends. Out: data catalogues (quests, phrases, facts, styles, the climb's city
 * and pilot), sprites and the page's own drawing rules, and the line's settings (overflow.ts): their
 * tests are the room server's (apps/edge/test/overflow.test.ts), which a run of this package does
 * not reach, so every one of its mutants would count as untested. The climb is a shard of its own:
 * its scripted runs are the slowest tests, and they cover nearly every one of its mutants.
 *
 * The vitest runner carries a patch (patches/@stryker-mutator__vitest-runner@10.0.0.patch): 10.0.0
 * picks a mutant's tests by their names joined with spaces, and vitest 5 matches names joined with
 * ' > ', so without it no test runs against any mutant and every one survives. Stryker 10.1.1 has the
 * same fix: the patch goes with the next upgrade.
 *
 * TODO-DOCS (OP-131): docs/TESTING.md: what mutation testing is in one paragraph, the scopes (this
 * file, apps/edge/stryker.config.mjs and the shards), the threshold schedule (break under 50 now, 70
 * after two weeks, 80 by the preview), the patch, and the list of equivalent mutants with why.
 */
import { strykerOptions } from '../../tools/mutation/stryker.mjs';

export default strykerOptions(
  {
    climb: ['src/climb.ts'],
    rules: [
      'src/climbbook.ts',
      'src/flight.ts',
      'src/jump.ts',
      'src/walk.ts',
      'src/resolveTarget.ts',
      'src/geometry.ts',
      'src/questbook.ts',
      'src/quests.ts',
      'src/book.ts',
      'src/shop.ts',
      'src/arcade.ts',
      'src/arcadebook.ts',
      'src/validate.ts',
      'src/edge.ts',
      'src/accounts.ts',
    ],
  },
  {
    // pnpm keeps each package to itself: the plugins are named, as found from this package.
    plugins: [import.meta.resolve('@stryker-mutator/vitest-runner'), import.meta.resolve('@stryker-mutator/typescript-checker')],
    // The tests as `vitest run` has them, with longer to finish (vitest.stryker.config.mjs).
    vitest: { configFile: 'vitest.stryker.config.mjs' },
  },
);

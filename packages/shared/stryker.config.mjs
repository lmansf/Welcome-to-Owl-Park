// @ts-check
/**
 * Mutation testing for the shared rules (OP-131): Stryker changes the code in small ways (a < for a
 * <=, a deleted return, || for &&) and runs the unit tests; a change no test notices is a line the
 * tests do not really check. Run with `pnpm --filter @owl-park/shared mutate` (MUTATION_SHARD=climb-1,
 * climb-2, climb-3, book, moves or floor for one shard); the report lands in reports/mutation
 * (index.html, mutation.json), and reports/stryker-incremental.json lets the next run test only what
 * changed. What both packages' configs share is in tools/mutation/stryker.mjs.
 *
 * In scope, by value (the ticket's order): the climb's and the flight's simulation, walking and its
 * targets, quest state, the collection book's grants and the shop, the arcade's payouts, and the
 * checks on what a page sends. Out: data catalogues (quests, phrases, facts, styles, the climb's city
 * and pilot), sprites and the page's own drawing rules, and the line's settings (overflow.ts): their
 * tests are the room server's (apps/edge/test/overflow.test.ts), which a run of this package does
 * not reach, so every one of its mutants would count as untested. The climb is three shards of its
 * own: its scripted runs are the slowest tests, and they cover nearly every one of its mutants. The
 * rest is three more, side by side (OP-131): together they took 35 minutes in CI (run 282).
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
import { piecesOf, strykerOptions } from '../../tools/mutation/stryker.mjs';

// The climb in three shards, its step cut at the dash and at the cling: the layout, its helpers and the
// step's clock; the dash, the run, the jump, the fall and the collisions; the cling, the glass, the
// benches, the hazards and the floors. About 250 mutants each: whole, the climb took 43 minutes on CI.
// Cut, only the step's body emptied whole is in no piece, and every one of the climb's tests would
// catch that.
const climb = piecesOf(new URL('./', import.meta.url), 'src/climb.ts', ['// 2. The dash', '// 8. The cling']);

export default strykerOptions(
  {
    'climb-1': [climb[0]],
    'climb-2': [climb[1]],
    'climb-3': [climb[2]],
    // The collection book and what pays into it: quests, the shop, the arcade's payouts, accounts.
    book: ['src/questbook.ts', 'src/quests.ts', 'src/book.ts', 'src/shop.ts', 'src/arcade.ts', 'src/arcadebook.ts', 'src/accounts.ts'],
    // An owl's moves and what a page may send: flight, a walk, the way round a bend, the climb's runs,
    // the frames.
    moves: ['src/climbbook.ts', 'src/flight.ts', 'src/jump.ts', 'src/walk.ts', 'src/wayAround.ts', 'src/validate.ts', 'src/edge.ts'],
    // The floor's shape and a walk's end on it: nearly every test reaches them, the way round a bend's
    // sweep of every room among them (OP-148), so each of their mutants runs the most tests. Measured
    // here (four cores, every mutant): these 10 min 31 s; the rest of the shared rules 14 min 11 s and
    // the way round 4 min 16 s, the rest's time going mostly by its number of mutants.
    floor: ['src/geometry.ts', 'src/resolveTarget.ts'],
  },
  {
    // pnpm keeps each package to itself: the plugins are named, as found from this package.
    plugins: [import.meta.resolve('@stryker-mutator/vitest-runner'), import.meta.resolve('@stryker-mutator/typescript-checker')],
    // The tests as `vitest run` has them, with longer to finish (vitest.stryker.config.mjs).
    vitest: { configFile: 'vitest.stryker.config.mjs' },
  },
);

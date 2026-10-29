// @ts-check
/**
 * Mutation testing for the room server and the Worker (OP-131): Stryker changes the code in small ways
 * (a < for a <=, a deleted return, || for &&) and runs the unit tests; a change no test notices is a
 * line the tests do not really check. Run with `pnpm --filter @owl-park/edge mutate` (it makes the
 * Worker's types first, as the typecheck does; MUTATION_SHARD=room or worker for one scope); the
 * report lands in reports/mutation (index.html, mutation.json), and reports/stryker-incremental.json
 * lets the next run test only what changed. What both packages' configs share is in
 * tools/mutation/stryker.mjs.
 *
 * Two scopes, each a shard scored on its own, by value (the ticket's order). The room server: the
 * room and its object (join and leave, the caps, the emote and position limits), the line and its
 * object, the copies of a room, the collection log's outbox. The Worker: passes and the gate, accounts,
 * the store's webhooks and their signature, the ticket desk and book (the one-device claim move), the
 * vote ledger, and from the Worker's entry point only its admin-key check and the pass it reads from a
 * request, found by name. The keepers' pages (*Page.ts) and the SQL stores are out.
 *
 * TODO-DOCS (OP-131): docs/TESTING.md, with packages/shared/stryker.config.mjs (the scopes, the
 * threshold schedule and the equivalent mutants).
 */
import { linesOf, strykerOptions } from '../../tools/mutation/stryker.mjs';

const root = new URL('./', import.meta.url);

export default strykerOptions(
  {
    room: ['src/Room.ts', 'src/RoomObject.ts', 'src/Overflow.ts', 'src/line.ts', 'src/copies.ts', 'src/collectLog.ts'],
    worker: [
      'src/pass.ts',
      'src/gate.ts',
      'src/gateSwitch.ts',
      'src/accounts.ts',
      'src/accountBook.ts',
      'src/shopify.ts',
      'src/storeHooks.ts',
      'src/ticketDesk.ts',
      'src/TicketBook.ts',
      'src/tickets.ts',
      'src/Ledger.ts',
      linesOf(root, 'src/index.ts', 'isAdmin'),
      linesOf(root, 'src/index.ts', 'passFrom'),
    ],
  },
  {
    // pnpm keeps each package to itself: the plugins are named, as found from this package.
    plugins: [import.meta.resolve('@stryker-mutator/vitest-runner'), import.meta.resolve('@stryker-mutator/typescript-checker')],
  },
);

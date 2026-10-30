/**
 * The chaos experiments (OP-132), in the ticket's order of risk. Each names its hypothesis, blast
 * radius and rollback; the abort rule is the harness's own (lib/runlog.mjs ABORT_RULE). Those not
 * built yet say what they wait on, and the harness records a run of one as not runnable.
 */
import roomServerKilled from './01-room-server-killed.mjs';
import roomsFull from './04-rooms-full.mjs';
import emoteFlood from './07-emote-flood.mjs';

const later = (what) => ({ notRunnable: what, run() {}, rollback() {} });

export const EXPERIMENTS = [
  roomServerKilled,
  {
    n: 2,
    id: 'fraud-endpoint-stalled',
    name: 'The fraud scoring endpoint stalled, then gone',
    hypothesis: 'With the scoring endpoint 5 s slow, then down, a checkout fails open inside 2 s and the keepers’ page shows it (OP-090).',
    blastRadius: "The throwaway park's call to a stand-in scoring endpoint only.",
    rollback: 'The stand-in endpoint answers at once again.',
    ...later('needs the fraud link (OP-053), which is in Backlog: the park does not call a scoring endpoint yet'),
  },
  {
    n: 3,
    id: 'webhook-dropped',
    name: "The store's webhook answered 500, then timed out",
    hypothesis: 'The store retries a webhook the Worker failed, and the order lands once, never twice.',
    blastRadius: "The throwaway park's webhook route and the stand-in store.",
    rollback: 'The stand-in store answers the park normally again.',
    ...later('not built yet: next on claude/chaos-harness (the stand-in store learns to fail on cue)'),
  },
  roomsFull,
  {
    n: 5,
    id: 'slow-phone',
    name: 'One phone on a 3G network',
    hypothesis: 'A phone on 3G stays playable, and the load screen shows real progress (OP-129).',
    blastRadius: 'One scripted phone page in the throwaway park.',
    rollback: 'The page closes.',
    ...later('not built yet: next on claude/chaos-harness'),
  },
  {
    n: 6,
    id: 'clock-skew',
    name: "A visitor's clock 10 minutes fast",
    hypothesis: 'Pass verification still works, or fails with a clear message.',
    blastRadius: 'One scripted page in the throwaway park.',
    rollback: 'The page closes.',
    ...later('not built yet: next on claude/chaos-harness'),
  },
  emoteFlood,
  {
    n: 8,
    id: 'log-sink-down',
    name: 'The collection log’s database unreachable',
    hypothesis: 'Pickups still work and their log rows wait in the outbox (OP-107).',
    blastRadius: "The throwaway park's collection log sink only.",
    rollback: 'The sink is reachable again and the outbox drains.',
    ...later('not built yet: next on claude/chaos-harness'),
  },
];

/** An experiment by its id or its number. */
export function experimentFor(key) {
  return EXPERIMENTS.find((e) => e.id === key || String(e.n) === String(key)) ?? null;
}

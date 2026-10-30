/**
 * The chaos experiments (OP-132), in the ticket's order of risk. Each names its hypothesis, blast
 * radius and rollback; the abort rule is the harness's own (lib/runlog.mjs ABORT_RULE). Those not
 * built yet say what they wait on, and the harness records a run of one as not runnable.
 */
import roomServerKilled from './01-room-server-killed.mjs';
import webhookDropped from './03-webhook-dropped.mjs';
import roomsFull from './04-rooms-full.mjs';
import slowPhone from './05-slow-phone.mjs';
import clockSkew from './06-clock-skew.mjs';
import emoteFlood from './07-emote-flood.mjs';
import logSinkDown from './08-log-sink-down.mjs';

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
  webhookDropped,
  roomsFull,
  slowPhone,
  clockSkew,
  emoteFlood,
  logSinkDown,
];

/** An experiment by its id or its number. */
export function experimentFor(key) {
  return EXPERIMENTS.find((e) => e.id === key || String(e.n) === String(key)) ?? null;
}

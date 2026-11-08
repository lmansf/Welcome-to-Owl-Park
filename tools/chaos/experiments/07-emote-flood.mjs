/**
 * Experiment 7 (OP-132): one visitor floods the hub with its starter emote, 50 a second for up to
 * 10 s, while the fleet walks about. The room plays one emote per 1.5 s from an owl and drops the
 * rest, and closes a socket that sends more than 40 frames in 5 s (apps/edge/src/Room.ts LIMITS).
 */
import { STARTER_PACK } from '../lib/shared.mjs';

const RATE_PER_S = 50;
const FOR_MS = 10_000;
const FLOODER = 900;
// An emote every new visitor owns: one it does not own, the room ignores before any rate limit.
const EMOTE = STARTER_PACK[0];
const EMOTE_EVERY_MS = 1_500;
// The others' moves are judged from the flood's start for this long, some fifty of them, so one slow
// echo is not the whole p95; a move sent near its end has 5 s more to come back.
const JUDGED_MS = 10_000;
const ECHO_GRACE_MS = 5_000;

export default {
  n: 7,
  id: 'emote-flood',
  name: 'One visitor floods the room with emotes',
  hypothesis: 'A visitor sending 50 emotes a second is throttled (its extra emotes dropped, then its socket closed), and nobody else in the room lags or loses a move (OP-089).',
  blastRadius: "One extra scripted visitor in the throwaway park's hub, flooding for 10 s at most.",
  rollback: 'The flooding visitor leaves; the harness closes its socket if the room has not.',
  expectLogs: [
    {
      component: 'room server',
      event: 'emote_throttled',
      withRun: true,
      question: "Did the room server drop the flood's emotes, and how many?",
      add: 'emote_throttled with the number dropped (RoomObject.ts)',
    },
    {
      component: 'room server',
      event: 'room_leave',
      withRun: true,
      question: 'Did the room server close the flooding socket, and why?',
      add: "room_leave with reason kick and detail 'too many frames' when a socket is closed for flooding (RoomObject.ts)",
    },
  ],
  async run(ctx) {
    const flooder = ctx.visitor(FLOODER, { comeBack: false });
    ctx.state.flooder = flooder;
    await flooder.join('hub');
    const t0 = Date.now();
    ctx.note('action', { what: `the flood starts: ${RATE_PER_S} '${EMOTE}' emotes a second` });
    let sent = 0;
    while (Date.now() - t0 < FOR_MS && flooder.open && !ctx.signal.aborted) {
      flooder.emote(EMOTE);
      sent += 1;
      await ctx.sleep(1000 / RATE_PER_S);
    }
    const close = flooder.lastClose;
    const floodMs = (close?.at ?? Date.now()) - t0;
    ctx.note('action', { what: 'the flood ends', sent, flood_ms: floodMs, closed: close });
    await ctx.sleep(Math.max(0, t0 + JUDGED_MS + ECHO_GRACE_MS - Date.now()));

    // What the others saw of the flood: the room plays the first emote, then one per 1.5 s.
    const seen = Math.max(0, ...ctx.fleet.visitors.map((v) => v.heardEmotes.get(flooder.id) ?? 0));
    const allowed = 1 + Math.floor(floodMs / EMOTE_EVERY_MS);
    ctx.observe({
      what: "the flood's emotes the others saw played",
      value: `${seen} of ${sent} sent over ${floodMs} ms`,
      ok: seen >= 1 && seen <= allowed,
      component: 'room server',
      fix: "play at most one emote per owl every 1.5 s (Room.ts emote) and drop the rest before they are sent on",
    });
    ctx.observe({
      what: 'the flooding socket closed by the room',
      value: close ? `after ${close.at - t0} ms and ${sent} emotes: code ${close.code} (${close.reason || 'no reason'})` : `still open after ${sent} emotes`,
      ok: close?.code === 4003,
      component: 'room server',
      fix: 'close a socket that sends past the frame limit (Room.ts admitFrame) for emotes too',
    });
    const judged = ctx.fleet.window(Date.now() - t0);
    ctx.observe({
      what: "the others' move echo p95 from the flood's start",
      value: judged.p95,
      unit: `ms (${judged.moves} moves)`,
      ok: judged.p95 !== null && judged.p95 <= 300,
      component: 'room server',
      fix: "drop a flooder's frames before any work is done for them",
    });
    ctx.observe({
      what: "moves the others lost from the flood's start",
      value: `${judged.failed} of ${judged.moves}`,
      ok: judged.rate < 0.01,
      component: 'room server',
    });
  },
  async rollback(ctx) {
    await ctx.state.flooder?.leave();
  },
};

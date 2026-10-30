/**
 * Experiment 4 (OP-132): the hub filled to its cap (80, the fleet's 10 among them), then one more,
 * with the line set to start by itself at 80 owls in the park, as the keepers would set it before a
 * busy night (OP-075). The realm half of the ticket's experiment (a realm to 40) comes next.
 *
 * Two newcomers: one as the last of the crowd comes in, and one once the line has had its time to
 * count the park (the overflow object counts at most every 5 s, Overflow.ts COUNT_FRESH_MS, and each
 * Worker keeps its answer 3 s, overflowState.ts OVERFLOW_KEEP_MS). A newcomer the room server sends
 * to the line takes a number there, as a page does.
 */
const CAP = 80;
const CROWD_FIRST = 100;
const LINE_LAG_MS = 5_000 + 3_000;
const LINE_AS_DEPLOYED = { mode: 'off', threshold: 80, holdMin: 3 };

/** A newcomer to the hub, as a page comes: let in, turned away, or sent to the line, where it takes a number. */
async function arrive(ctx, n) {
  const v = ctx.visitor(n, { comeBack: false });
  ctx.state.crowd.push(v);
  try {
    const w = await v.join('hub');
    return { queued: false, outcome: `let in (copy ${w.copy ?? 1})` };
  } catch (e) {
    if (!e.code) return { queued: false, outcome: e.message };
    if (e.code !== 4012) return { queued: false, outcome: `turned away: code ${e.code} (${v.lastClose?.reason || 'no reason'})` };
    const number = await v.takeNumber();
    return { queued: number.state === 'waiting', outcome: `sent to the line (4012): ${number.state}${number.place ? `, place ${number.place}` : ''}` };
  }
}

export default {
  n: 4,
  id: 'rooms-full',
  name: 'The hub filled to its cap, then one more',
  hypothesis: 'With the line set to start by itself, filling the hub to its 80 owls puts the next visitor in the line with the busy ribbon on, and nobody already inside lags (OP-075, OP-088).',
  blastRadius: "The throwaway park's hub: 70 more scripted visitors beside the fleet's 10, then two more; the line's setting changed for the run and put back.",
  rollback: 'The extra visitors leave, and the line and the ribbon are set back as deployed (no line, no ribbon).',
  pauseChecks: { names: ['journey'], why: "the journey's page would be an 81st owl in a hub this experiment fills to its 80" },
  expectLogs: [
    {
      component: 'overflow',
      event: 'queue_enter',
      question: 'Did the line take the newcomer, and how long was it?',
      add: "queue_enter with the line's depth (Overflow.ts)",
    },
  ],
  async run(ctx) {
    await ctx.admin('capacity', { line: { mode: 'auto', threshold: CAP, holdMin: 3 } });
    ctx.state.lineChanged = true;
    ctx.note('action', { what: `the line set to start by itself at ${CAP} owls` });
    const t0 = Date.now();
    const crowd = [];
    ctx.state.crowd = crowd;
    const inside = () => crowd.filter((v) => v.open).length + ctx.fleet.visitors.filter((v) => v.open).length;
    for (let n = CROWD_FIRST; inside() < CAP && n < CROWD_FIRST + CAP && !ctx.signal.aborted; n++) {
      const v = ctx.visitor(n, { comeBack: false });
      crowd.push(v);
      try {
        await v.join('hub');
      } catch (e) {
        ctx.note('note', { what: `visitor ${n} not let in`, why: e.message });
      }
    }
    ctx.note('action', { what: 'the hub filled', inside: inside(), took_ms: Date.now() - t0 });
    ctx.observe({ what: 'owls in the hub before the newcomers', value: inside(), ok: inside() === CAP, component: 'room server' });

    const first = await arrive(ctx, 199);
    ctx.note('action', { what: 'a newcomer as the hub filled', outcome: first.outcome });
    ctx.observe({
      what: 'a newcomer as the hub filled',
      value: first.outcome,
      ok: first.queued,
      component: 'overflow',
      fix: "the line counts the park at most every 5 s and each Worker keeps its answer 3 s, so for up to 8 s after the park reaches the line's threshold a newcomer is told the room is full instead of waiting in the line: have a room that turns an owl away as full start the line at once (or keep the threshold below the room's cap by a few seconds' arrivals)",
    });
    await ctx.sleep(LINE_LAG_MS + 1_000);
    const second = await arrive(ctx, 198);
    ctx.note('action', { what: 'a newcomer once the line had counted', outcome: second.outcome });
    ctx.observe({
      what: `a newcomer ${(LINE_LAG_MS + 1_000) / 1000} s later, once the line has counted the park`,
      value: second.outcome,
      ok: second.queued,
      component: 'overflow',
      fix: 'a newcomer past the line threshold waits in the line (close 4012) and takes a number',
    });
    const notice = await (await fetch(`${ctx.base}/api/notice`, { headers: { 'X-Chaos-Run': ctx.run } })).json();
    ctx.observe({
      what: 'the busy ribbon',
      value: notice.words ?? 'off',
      ok: !!notice.words,
      component: 'overflow',
      fix: 'the ribbon comes on by itself while the line is active',
    });
    const w = ctx.fleet.window(Date.now() - t0);
    ctx.observe({ what: 'move echo p95 inside while the hub filled', value: w.p95, unit: `ms (${w.moves} moves)`, ok: w.p95 !== null && w.p95 <= 300, component: 'room server' });
    ctx.observe({ what: 'moves lost inside while the hub filled', value: `${w.failed} of ${w.moves}`, ok: w.rate < 0.01, component: 'room server' });
  },
  async rollback(ctx) {
    await Promise.all((ctx.state.crowd ?? []).map((v) => v.leave()));
    if (ctx.state.lineChanged) await ctx.admin('capacity', { line: LINE_AS_DEPLOYED, ribbon: { on: false, words: null } });
  },
};

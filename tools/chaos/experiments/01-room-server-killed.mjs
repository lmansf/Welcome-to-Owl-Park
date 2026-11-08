/**
 * Experiment 1 (OP-132): the room server killed mid-session. On this machine that is the wrangler dev
 * process (the Worker and every room object in it), killed at once with SIGKILL, kept down for 3 s,
 * then started again on the same storage. The fleet's visitors come back as a page does.
 */
const DOWN_MS = 3_000;
const BACK_WITHIN_MS = 10_000;
const STOOD_PX = 60;

export default {
  n: 1,
  id: 'room-server-killed',
  name: 'The room server killed mid-session',
  hypothesis: 'Every visitor in a room is back in within 10 s of the room server returning, its owl where it stood (OP-087).',
  blastRadius: "This machine's throwaway park only: its Worker and room server process, killed and kept down for 3 s; the stand-in store and the scripted visitors carry on.",
  rollback: 'Start the room server again on the same storage if it is still down, then wait for the steady state.',
  needs: 'local',
  expectLogs: [
    {
      component: 'room server',
      event: 'room_join_ok',
      withRun: true,
      atLeast: 10,
      question: 'Did the room server let each owl back in after it returned?',
      add: "room_join_ok for every welcome, with the socket's run_id (RoomObject.ts)",
    },
  ],
  async run(ctx) {
    await ctx.sleep(4_000); // the owls spread about the hub
    const stood = new Map(ctx.fleet.visitors.filter((v) => v.open).map((v) => [v.n, { ...v.pos }]));
    const back = new Map();
    const off = ctx.onVisitorEvent((e) => {
      if (e.kind === 'rejoined' && stood.has(e.visitor) && !back.has(e.visitor)) back.set(e.visitor, e);
    });
    ctx.note('action', { what: 'the room server killed (SIGKILL)' });
    const killedAt = Date.now();
    ctx.park.kill();
    ctx.state.down = true;
    await ctx.sleep(DOWN_MS);
    ctx.note('action', { what: 'the room server started again on the same storage' });
    await ctx.park.restart();
    ctx.state.down = false;
    const upAt = Date.now();
    ctx.note('action', { what: 'the room server is up', down_ms: upAt - killedAt });
    const until = upAt + 2 * BACK_WITHIN_MS;
    while (back.size < stood.size && Date.now() < until && !ctx.signal.aborted) await ctx.sleep(250);
    off();
    const gaps = [...back.values()].map((e) => e.at - upAt);
    const slowest = gaps.length ? Math.max(...gaps) : null;
    ctx.observe({
      what: 'visitors back in after the room server returned',
      value: `${back.size} of ${stood.size}`,
      ok: back.size === stood.size,
      component: 'room server',
      fix: 'every page that was in a room is let back in once the room server returns',
    });
    ctx.observe({
      what: 'the slowest visitor back, from the room server returning',
      value: slowest,
      unit: 'ms',
      ok: slowest !== null && slowest <= BACK_WITHIN_MS,
      component: 'page reconnect',
      fix: "a page tries again sooner after a dropped socket (apps/park/src/net/edge.ts: the backoff's ceiling)",
    });
    const moved = [...back.entries()].map(([n, e]) => Math.round(Math.hypot(e.pos.x - stood.get(n).x, e.pos.y - stood.get(n).y)));
    const far = moved.filter((d) => d > STOOD_PX).length;
    ctx.observe({
      what: `owls let back in more than ${STOOD_PX} px from where they stood`,
      value: `${far} of ${moved.length} (furthest ${moved.length ? Math.max(...moved) : 0} px)`,
      ok: far === 0,
      component: 'room server',
      fix: "keep where each owl stood through a restart: the room writes where an owl was (Room.ts leavers, kept by the room object) only as the owl leaves, and the owls of a killed room server never left, so after a restart a hello's position is trusted only near the spawn",
    });
  },
  async rollback(ctx) {
    if (!ctx.state.down) return;
    await ctx.park.restart();
    ctx.state.down = false;
  },
};

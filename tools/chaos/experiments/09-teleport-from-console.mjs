/**
 * Experiment 9 (OP-149): one visitor's page is worked from the console, as the 2026-10-30 pen-test
 * did, and sends what a tampered page can: a walk into the sky, standing up at the lantern beam's
 * height far from the beam, walks out of the room, a hello from the far end of the hub, and the
 * pen-test's own (9999, 9999). The room never takes an owl's place from its page while it plays: a
 * walk is a target, walked from where the room has the owl at walking pace (apps/edge/src/Room.ts),
 * so what the fleet is told of the tampered owl is the room's alone.
 */
import { distance, isWalkable, ROOMS, snapToWalkable } from '../lib/shared.mjs';

const ROOM = 'hub';
const TAMPERER = 901;
const ARRIVER = 902;
const NOWHERE = 903;
// Past any move the visitor's own walks numbered: the room ignores a move older than its last.
const SEQ = 999_999_000;
// A frame says any point in the biggest room there is (packages/shared validate.ts); the hub is smaller.
const OUT_OF_ROOM = { x: 6000, y: 1700 };
const SKY = { x: 2400, y: 20 };
const SETTLE_MS = 2_000;

const hub = ROOMS[ROOM];
/** The hub's floor plan: its floor and its perches' tops, where an owl can be at some height. */
const footing = [...hub.walkable, ...(hub.perches ?? []).map((p) => p.area)];
// The room rounds a walk's end to whole pixels: one on the floor's very edge is on it.
const onFloor = (p) => isWalkable(p, footing) || distance(p, snapToWalkable(p, footing)) <= 2;
const spawn = hub.spawns['default'];
// The lantern beam: standing at its height anywhere else is standing in mid-air.
const BEAM = (hub.perches ?? []).reduce((a, b) => (b.top > a.top ? b : a));

/** The floor's point furthest from the spawn, along the floor's middle: a hello from there is far from anywhere the hub lets an owl in. */
function farOnFloor() {
  let best = spawn;
  for (let x = 0; x <= hub.size.w; x += 40) {
    for (let y = 0; y <= hub.size.h; y += 20) {
      const p = { x, y };
      if (onFloor(p) && distance(p, spawn) > distance(best, spawn)) best = p;
    }
  }
  return best;
}

export default {
  n: 9,
  id: 'teleport-from-console',
  name: "A visitor's page worked from the console, to put its owl somewhere it cannot walk",
  hypothesis: 'Whatever a page sends from its console, the other visitors never see its owl off the floor or standing in mid-air, the room logs what it would not take (position_rejected), and a page that keeps asking for walks out of the room is closed (OP-149).',
  blastRadius: "Three extra scripted visitors in the throwaway park's hub, one at a time, for half a minute.",
  rollback: 'The scripted visitors leave; the harness closes any socket the room has not.',
  expectLogs: [
    {
      component: 'room server',
      event: 'position_rejected',
      withRun: true,
      question: 'Did the room server say which places and stances it would not take, and why?',
      add: 'position_rejected with the reason (room, floor, perch, arrival) and how many, at most once a minute per socket (RoomObject.ts)',
    },
    {
      component: 'room server',
      event: 'room_leave',
      withRun: true,
      question: 'Did the room server close the page that kept asking, and why?',
      add: "room_leave with reason kick and detail 'too many moves' (RoomObject.ts)",
    },
  ],
  async run(ctx) {
    const ids = new Set();
    const tamperer = ctx.visitor(TAMPERER, { comeBack: false });
    ctx.state.visitors = [tamperer];
    ids.add((await tamperer.join(ROOM)).id);

    ctx.note('action', { what: 'a walk into the sky, from the console', to: SKY });
    tamperer.raw({ t: 'move', to: SKY, seq: SEQ });
    await ctx.sleep(SETTLE_MS * 2);
    ctx.note('action', { what: "standing at the lantern beam's height, far from the beam", z: BEAM.top });
    tamperer.raw({ t: 'air', air: { z: BEAM.top, vz: 0, s: 0, f: 0 } });
    await ctx.sleep(SETTLE_MS);
    const air = ctx.fleet.visitors.some((v) => v.open && v.heardAir?.has(tamperer.id));
    ctx.note('action', { what: 'three walks out of the room, from the console', to: OUT_OF_ROOM });
    for (let i = 1; i <= 3; i++) tamperer.raw({ t: 'move', to: OUT_OF_ROOM, seq: SEQ + i });
    await ctx.sleep(SETTLE_MS);
    const closed = tamperer.lastClose;

    // A page back with a hello from the hub's far end: the hub lets it in by its spawn.
    const far = farOnFloor();
    const arriver = ctx.visitor(ARRIVER, { comeBack: false });
    ctx.state.visitors.push(arriver);
    arriver.pos = far;
    ctx.note('action', { what: "a hello from the hub's far end", pos: far });
    const welcome = await arriver.join(ROOM);
    ids.add(welcome.id);
    await ctx.sleep(SETTLE_MS);

    // The pen-test's own (9999, 9999): no room is that big, and the hello is not one.
    const nowhere = ctx.visitor(NOWHERE, { comeBack: false });
    ctx.state.visitors.push(nowhere);
    nowhere.pos = { x: 9999, y: 9999 };
    ctx.note('action', { what: 'a hello from (9999, 9999)' });
    const refused = await nowhere.join(ROOM).then(
      () => null,
      (e) => e.code ?? e.message,
    );
    await ctx.sleep(SETTLE_MS);

    const seen = ctx.fleet.visitors.flatMap((v) => [...ids].flatMap((id) => v.sawAt.get(id) ?? []));
    const off = seen.filter((p) => !onFloor(p));
    ctx.observe({
      what: "places the fleet was told the console's owls are at or walking to",
      value: `${seen.length} told, ${off.length} off the floor${off.length ? `: ${JSON.stringify(off.slice(0, 3))}` : ''}`,
      ok: seen.length > 0 && off.length === 0,
      component: 'room server',
      fix: 'walk each target from where the room has the owl, on its own floor (Room.ts move), and tell the others only that walk',
    });
    ctx.observe({
      what: 'standing in mid-air told to the fleet',
      value: air ? 'told' : 'not told',
      ok: !air,
      component: 'room server',
      fix: "drop a stance up on a perch where no perch that high is near the owl (Room.ts air, perchFor)",
    });
    ctx.observe({
      what: 'the page that asked for walks out of the room',
      value: closed ? `closed: code ${closed.code} (${closed.reason || 'no reason'})` : 'still open',
      ok: closed?.code === 4003,
      component: 'room server',
      fix: 'drop a walk to a point outside the room and strike it like a burst of moves (Room.ts move)',
    });
    ctx.observe({
      what: "where the hub let in a page that said it was at its far end",
      value: `${Math.round(distance(welcome.you.pos, spawn))} px from the spawn, ${Math.round(distance(welcome.you.pos, far))} px from where it said`,
      ok: distance(welcome.you.pos, far) > 240,
      component: 'room server',
      fix: 'take a hello’s place only near the spawn or near where the owl left lately (Room.ts join)',
    });
    ctx.observe({
      what: 'a hello from (9999, 9999)',
      value: refused === null ? 'let in' : `refused: ${refused}`,
      ok: refused === 4002,
      component: 'room server',
      fix: 'refuse a frame with a point outside the biggest room as malformed (packages/shared edge.ts parseClientFrame)',
    });
  },
  async rollback(ctx) {
    for (const v of ctx.state.visitors ?? []) await v.leave();
  },
};

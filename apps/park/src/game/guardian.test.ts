import { describe, expect, it } from 'vitest';
import { distance, pointInRect, type Vec2 } from '@owl-park/shared';
import { HALL_ROOM, RUN_Y } from '@owl-park/shared/rooms';
import { PLAY_SPOTS } from './featherTrail';
import {
  AT_REST,
  CALLS,
  GUARDIAN_ART,
  GUARDIAN_AT,
  GUARDIAN_ROOM,
  GUARDIAN_RULES as R,
  GUARDIAN_SCALE,
  GuardianMind,
  HEAD_REACH,
  eased,
  GUARDIAN_VIEW,
  guardianBoxes,
  guardianShade,
  headToward,
  inRoom,
  lookShowing,
  mustShow,
  presence,
  seeded,
  seenAt,
  type GuardianFrame,
  type OwlSeen,
} from './guardian';
import { OWL_BODY, hiddenBehind } from './seeThrough';

const FACE = inRoom(GUARDIAN_ART.face);
const HEART = HALL_ROOM.thermals![0]!;
const owl = (id: string, pos: Vec2, z = 0, lifted = false): OwlSeen => ({ id, pos, z, lifted });
const mind = (seed = 7) => new GuardianMind({ face: FACE, heart: HEART, seed });
/** Where an owl comes in by the knothole, and a spot out in front of the guardian. */
const KNOTHOLE = HALL_ROOM.spawns['from-lobby']!;
const IN_FRONT: Vec2 = { x: GUARDIAN_AT.x, y: GUARDIAN_AT.y + 160 };

/** The mind run from `from` to `to` at `step` ms a frame, the same owls throughout: every frame it gave. */
function run(m: GuardianMind, from: number, to: number, owls: readonly OwlSeen[], step = 16): GuardianFrame[] {
  const out: GuardianFrame[] = [];
  for (let t = from; t <= to; t += step) out.push(m.frame(t, owls));
  return out;
}

describe('where the guardian stands (OP-359)', () => {
  it('lives in the Great Hollow, on its middle line, in front of the gap between the inner root runs', () => {
    expect(GUARDIAN_ROOM).toBe('m3-hall');
    expect(GUARDIAN_AT.x).toBe(HALL_ROOM.size.w / 2);
    expect(GUARDIAN_AT.y).toBeGreaterThan(RUN_Y + 60);
    // Its foot is on the floor an owl walks.
    expect(GUARDIAN_AT.y).toBeLessThan(HALL_ROOM.size.h - 300);
  });

  it('is about nine owls tall: eight or more, and inside the room', () => {
    const boxes = guardianBoxes();
    const top = Math.min(...boxes.map((b) => b.y));
    const tall = GUARDIAN_AT.y - top;
    expect(tall / OWL_BODY.h).toBeGreaterThanOrEqual(8);
    expect(tall / OWL_BODY.h).toBeLessThanOrEqual(10);
    expect(top).toBeGreaterThan(0);
    for (const b of boxes) {
      expect(b.x).toBeGreaterThan(0);
      expect(b.x + b.w).toBeLessThan(HALL_ROOM.size.w);
    }
  });

  it('hides no owl where an owl arrives: every way into the hall sets its owl down in plain sight', () => {
    for (const [name, at] of Object.entries(HALL_ROOM.spawns)) {
      const z = HALL_ROOM.spawnTops?.[name] ?? 0;
      for (const box of guardianBoxes()) expect(hiddenBehind(at, z, box, GUARDIAN_AT.y), name).toBe(false);
    }
  });

  it('is seen whole from where an owl comes in by the knothole: its head ends under that owl, with room for the doorway’s sign', () => {
    const top = Math.min(...guardianBoxes().map((b) => b.y));
    expect(top - KNOTHOLE.y).toBeGreaterThanOrEqual(150);
    // And the whole of it is within a screen's depth of that owl (townView.ts shows 1500 of a room's depth).
    expect(GUARDIAN_AT.y + (GUARDIAN_ART.h - GUARDIAN_ART.foot.y) * GUARDIAN_SCALE).toBeLessThan(1500);
  });

  it('has the heart’s rising air at its chest: an owl standing in it is behind the guardian, which then goes see-through', () => {
    expect(guardianBoxes().some((box) => hiddenBehind(HEART.pos, 0, box, GUARDIAN_AT.y))).toBe(true);
    // Carried up over its head, that owl shows again.
    expect(guardianBoxes().some((box) => hiddenBehind(HEART.pos, HEART.top, box, GUARDIAN_AT.y))).toBe(false);
  });

  it('keeps the feather trail off the floor it covers, and leaves every place the trail leads to outside it', () => {
    const shade = guardianShade();
    for (const b of guardianBoxes()) expect(shade.some((s) => s.x < b.x && s.y < b.y && s.x + s.w > b.x + b.w && s.y + s.h > b.y + b.h)).toBe(true);
    for (const spot of PLAY_SPOTS[HALL_ROOM.id] ?? []) {
      const middle = { x: spot.rect.x + spot.rect.w / 2, y: spot.rect.y + spot.rect.h / 2 };
      expect(shade.some((s) => pointInRect(middle, s)), spot.id).toBe(false);
    }
    for (const d of HALL_ROOM.doors) if (d.marker) expect(shade.some((s) => pointInRect(d.marker!, s)), d.id).toBe(false);
    expect(shade.some((s) => pointInRect(KNOTHOLE, s))).toBe(false);
  });

  it('puts a point of its painting in the room by its foot and its size', () => {
    expect(inRoom(GUARDIAN_ART.foot)).toEqual(GUARDIAN_AT);
    expect(inRoom({ x: GUARDIAN_ART.foot.x + 100, y: GUARDIAN_ART.foot.y - 100 })).toEqual({ x: GUARDIAN_AT.x + 100 * GUARDIAN_SCALE, y: GUARDIAN_AT.y - 100 * GUARDIAN_SCALE });
  });
});

describe('how the guardian looks at an owl: by turning its head, as an owl does', () => {
  it('rolls and shifts its head toward an owl off to one side, and not at all for one straight ahead', () => {
    const east = headToward({ x: FACE.x + 600, y: FACE.y + 400 }, FACE);
    const west = headToward({ x: FACE.x - 600, y: FACE.y + 400 }, FACE);
    expect(east.roll).toBeGreaterThan(0);
    expect(east.dx).toBeGreaterThan(0);
    expect(west.roll).toBeCloseTo(-east.roll, 9);
    expect(west.dx).toBeCloseTo(-east.dx, 9);
    const ahead = headToward({ x: FACE.x, y: FACE.y + 400 }, FACE);
    expect(ahead.roll).toBe(0);
    expect(ahead.dx).toBe(0);
  });

  it('lifts its head for an owl above its face on the screen and lowers it for one below', () => {
    expect(headToward({ x: FACE.x, y: FACE.y - 300 }, FACE).dy).toBeLessThan(0);
    expect(headToward({ x: FACE.x, y: FACE.y + 300 }, FACE).dy).toBeGreaterThan(0);
  });

  it('never goes past its reach, however far off the owl is', () => {
    for (const target of [{ x: FACE.x + 5000, y: FACE.y - 5000 }, { x: FACE.x - 5000, y: FACE.y + 5000 }]) {
      const p = headToward(target, FACE);
      expect(Math.abs(p.roll)).toBeLessThanOrEqual(HEAD_REACH.roll + 1e-9);
      expect(Math.abs(p.dx)).toBeLessThanOrEqual(HEAD_REACH.dx + 1e-9);
      expect(p.dy).toBeGreaterThanOrEqual(-HEAD_REACH.up - 1e-9);
      expect(p.dy).toBeLessThanOrEqual(HEAD_REACH.down + 1e-9);
    }
  });

  it('looks at the middle of an owl as it is drawn: up in the air by its height', () => {
    expect(seenAt({ pos: { x: 100, y: 900 }, z: 0 }).y).toBeLessThan(900);
    expect(seenAt({ pos: { x: 100, y: 900 }, z: 300 }).y).toBe(seenAt({ pos: { x: 100, y: 900 }, z: 0 }).y - 300);
  });

  it('eases to where it is going without ever going past it, the same at ten frames a second as at a hundred', () => {
    const go = (step: number) => {
      let v = 0;
      let s = 0;
      let most = 0;
      // Three seconds of it, in whole steps.
      for (let i = 0; i < Math.round(3 / step); i++) {
        [v, s] = eased(v, s, 10, step, R.headRate);
        most = Math.max(most, v);
      }
      return { v, most };
    };
    const slow = go(0.1);
    const fast = go(0.01);
    expect(slow.v).toBeCloseTo(fast.v, 6);
    expect(slow.most).toBeLessThanOrEqual(10);
    expect(fast.most).toBeLessThanOrEqual(10);
    // A second and a quarter in, it is most of the way there; it moves slowly.
    let v = 0;
    let s = 0;
    [v, s] = eased(v, s, 10, 0.3, R.headRate);
    expect(v).toBeLessThan(5);
    [v, s] = eased(v, s, 10, 0.95, R.headRate);
    expect(v).toBeGreaterThan(8);
  });
});

describe('the camera near the guardian: its face stays in view', () => {
  const HEAD = guardianBoxes()[0]!;
  /** A computer's screen at the hall's zoom, the camera resting on a point as it follows an owl there. */
  const SCREEN = { w: 1440, h: 900 };
  const near = (x: number, y: number) => ({ zoom: 0.6, x, y });
  const holds = (look: { zoom: number; x: number; y: number }, r: { x: number; y: number; w: number; h: number }) => {
    const w = SCREEN.w / look.zoom;
    const h = SCREEN.h / look.zoom;
    return look.x - w / 2 <= r.x + 1e-6 && look.x + w / 2 >= r.x + r.w - 1e-6 && look.y - h / 2 <= r.y + 1e-6 && look.y + h / 2 >= r.y + r.h - 1e-6;
  };

  it('is wholly the guardian’s on the floor round it: where an owl comes in, at the heart, and out in front of its foot', () => {
    expect(presence(KNOTHOLE)).toBe(1);
    expect(presence(HALL_ROOM.spawns['default']!)).toBe(1);
    expect(presence(HEART.pos)).toBe(1);
    expect(presence({ x: GUARDIAN_AT.x, y: GUARDIAN_AT.y + GUARDIAN_VIEW.front })).toBe(1);
    expect(presence({ x: GUARDIAN_AT.x + GUARDIAN_VIEW.side, y: GUARDIAN_AT.y })).toBe(1);
  });

  it('is the owl’s own again away from it, coming back by degrees and never by a jump', () => {
    const east = (d: number) => presence({ x: GUARDIAN_AT.x + GUARDIAN_VIEW.side + d, y: GUARDIAN_AT.y });
    expect(east(GUARDIAN_VIEW.fade)).toBe(0);
    expect(east(GUARDIAN_VIEW.fade + 500)).toBe(0);
    let last = 1;
    for (let d = 0; d <= GUARDIAN_VIEW.fade; d += 10) {
      const p = east(d);
      expect(p).toBeLessThanOrEqual(last);
      expect(last - p).toBeLessThan(0.08);
      last = p;
    }
    // At the hall's two ends an owl is far from it.
    expect(presence({ x: 300, y: GUARDIAN_AT.y })).toBe(0);
    expect(presence({ x: HALL_ROOM.size.w - 300, y: GUARDIAN_AT.y })).toBe(0);
  });

  /** The box that holds both of what must show. */
  const both = (m: { owl: { x: number; y: number; w: number; h: number }; head: { x: number; y: number; w: number; h: number } }) => {
    const x = Math.min(m.owl.x, m.head.x);
    const y = Math.min(m.owl.y, m.head.y);
    return { x, y, w: Math.max(m.owl.x + m.owl.w, m.head.x + m.head.w) - x, h: Math.max(m.owl.y + m.owl.h, m.head.y + m.head.h) - y };
  };

  it('must show the owl and its head, each with room over it and under it', () => {
    const owl = { x: GUARDIAN_AT.x + 300, y: GUARDIAN_AT.y + 400 };
    const must = mustShow(owl, 0, { over: 40, under: 120 });
    expect(must.head.y).toBe(HEAD.y - GUARDIAN_VIEW.over - 40);
    expect(must.head.x).toBe(HEAD.x - GUARDIAN_VIEW.beside);
    expect(must.owl.y + must.owl.h).toBe(owl.y + GUARDIAN_VIEW.under + 120);
    expect(must.owl.x + must.owl.w).toBeGreaterThanOrEqual(owl.x + GUARDIAN_VIEW.beside);
    // An owl up in the air over its head is shown where it is drawn.
    const high = mustShow(HEART.pos, HEART.top);
    expect(high.owl.y).toBeLessThan(HEART.pos.y - HEART.top - 80);
  });

  it('leaves the owl’s own view as it is where that already holds the two', () => {
    const owl = HALL_ROOM.spawns['default']!;
    const own = near(owl.x, owl.y - 300);
    const must = mustShow(owl, 0);
    expect(holds(own, both(must))).toBe(true);
    expect(lookShowing(own, must, SCREEN)).toEqual(own);
  });

  it('moves up only as far as brings its head in, for an owl a few strides out in front', () => {
    const owl = { x: GUARDIAN_AT.x, y: GUARDIAN_AT.y + 330 };
    const own = near(owl.x, owl.y - 300);
    const must = mustShow(owl, 0);
    expect(holds(own, both(must))).toBe(false);
    const look = lookShowing(own, must, SCREEN);
    expect(look.zoom).toBe(own.zoom);
    expect(look.x).toBe(own.x);
    expect(look.y).toBeLessThan(own.y);
    expect(holds(look, both(must))).toBe(true);
    // No further than it had to: the top of what must show is at the top of the screen.
    expect(look.y - SCREEN.h / look.zoom / 2).toBeCloseTo(must.head.y, 6);
  });

  it('draws back where one screen cannot hold the two, and never so far that an owl is drawn much smaller', () => {
    const owl = { x: GUARDIAN_AT.x, y: GUARDIAN_AT.y + 800 };
    const own = near(owl.x, owl.y - 300);
    const must = mustShow(owl, 0);
    const look = lookShowing(own, must, SCREEN);
    expect(look.zoom).toBeLessThan(own.zoom);
    expect(look.zoom).toBeGreaterThanOrEqual(own.zoom * GUARDIAN_VIEW.least);
    expect(holds(look, both(must))).toBe(true);
    expect(GUARDIAN_VIEW.least).toBeGreaterThanOrEqual(0.7);
  });

  it('keeps the owl whole on the screen where even drawn back the two do not fit: a phone held sideways, the owl well out in front', () => {
    const phone = { w: 844, h: 390 };
    const zoom = 0.42;
    const owl = { x: GUARDIAN_AT.x + 200, y: GUARDIAN_AT.y + 700 };
    const must = mustShow(owl, 0, { over: 100, under: 60 });
    const look = lookShowing({ zoom, x: owl.x, y: owl.y - 180 }, must, phone);
    expect(look.zoom).toBeCloseTo(zoom * GUARDIAN_VIEW.least, 9);
    const view = { w: phone.w / look.zoom, h: phone.h / look.zoom };
    expect(both(must).h).toBeGreaterThan(view.h);
    // The owl, with its room, is all in view.
    expect(look.y + view.h / 2).toBeGreaterThanOrEqual(must.owl.y + must.owl.h - 1e-6);
    expect(look.y - view.h / 2).toBeLessThanOrEqual(must.owl.y + 1e-6);
    expect(look.x - view.w / 2).toBeLessThanOrEqual(must.owl.x + 1e-6);
    expect(look.x + view.w / 2).toBeGreaterThanOrEqual(must.owl.x + must.owl.w - 1e-6);
    // And the view is as far up toward its head as that allows: the owl's room ends at the foot of the screen.
    expect(look.y + view.h / 2).toBeCloseTo(must.owl.y + must.owl.h, 6);
    // Nearer, the same phone holds the two.
    const close = mustShow({ x: GUARDIAN_AT.x, y: GUARDIAN_AT.y + 100 }, 0);
    const held = lookShowing({ zoom, x: GUARDIAN_AT.x, y: GUARDIAN_AT.y - 80 }, close, phone);
    const hv = { w: phone.w / held.zoom, h: phone.h / held.zoom };
    expect(held.y - hv.h / 2).toBeLessThanOrEqual(close.head.y + 1e-6);
    expect(held.y + hv.h / 2).toBeGreaterThanOrEqual(close.owl.y + close.owl.h - 1e-6);
  });
});

describe('the guardian’s mind', () => {
  it('sleeps until an owl comes in, and that owl sees its eyes open', () => {
    const m = mind();
    const me = owl('me', KNOTHOLE);
    expect(m.frame(0, [])).toMatchObject({ lids: 'closed', dozing: true, attending: null });
    m.arrived('me', 1000, true);
    // Still asleep for a moment after the owl is in: the eyes are seen to open.
    expect(m.frame(1000 + R.wakeAfterMs - 50, [me])).toMatchObject({ lids: 'closed', dozing: true });
    const waking = run(m, 1000 + R.wakeAfterMs, 1000 + R.wakeAfterMs + 1200, [me]);
    const order = waking.map((f) => f.lids).filter((l, i, all) => i === 0 || l !== all[i - 1]);
    expect(order.slice(0, 3)).toEqual(['closed', 'half', 'open']);
    expect(waking.at(-1)).toMatchObject({ dozing: false, attending: 'me' });
  });

  it('only looks at an owl that comes in while it is awake: its eyes stay open', () => {
    const m = mind();
    const me = owl('me', IN_FRONT);
    m.arrived('me', 0, false);
    run(m, 0, 5000, [me]);
    const other = owl('other', KNOTHOLE);
    m.arrived('other', 5000, false);
    const frames = run(m, 5016, 5016 + R.wakeAfterMs + 400, [me, other], 4);
    expect(frames.every((f) => !f.dozing)).toBe(true);
    expect(frames.at(-1)!.attending).toBe('other');
  });

  it('greets an owl that comes in by the knothole: its head lifts toward it, tilts as owls do at something new, and it hoots once', () => {
    const m = mind();
    const me = owl('me', KNOTHOLE);
    m.arrived('me', 0, true);
    const frames = run(m, 0, 6000, [me]);
    const hoots = frames.filter((f) => f.hooted);
    expect(hoots).toHaveLength(1);
    expect(m.hooted).toBe(1);
    const at = (ms: number) => frames[Math.round(ms / 16)]!;
    // Its hoot comes when the rules say, after the tilt has begun.
    expect(frames.findIndex((f) => f.hooted) * 16).toBeGreaterThanOrEqual(R.greetAfterMs);
    expect(frames.findIndex((f) => f.hooted) * 16).toBeLessThan(R.greetAfterMs + 40);
    // The owl is above its face on the screen: once it has settled, its head is lifted.
    expect(at(5800).head.dy).toBeLessThan(-3);
    // The tilt: more roll in its middle than looking at that owl takes.
    const lookRoll = Math.abs(headToward(seenAt(me), FACE).roll);
    const most = Math.max(...frames.slice(Math.round(R.tiltAfterMs / 16), Math.round((R.tiltAfterMs + R.tiltMs) / 16)).map((f) => Math.abs(f.head.roll)));
    expect(most).toBeGreaterThan(lookRoll + HEAD_REACH.tilt * 0.4);
    // And it is over: its head is back to looking.
    expect(Math.abs(at(5800).head.roll)).toBeLessThan(lookRoll + 0.01);
  });

  it('keeps its eye on the owl it is greeting when another comes in meanwhile', () => {
    const m = mind();
    const me = owl('me', KNOTHOLE);
    // Another owl, much nearer its face than the one that has come in.
    const other = owl('other', { x: FACE.x + 80, y: FACE.y + 200 });
    expect(distance(seenAt(other), FACE)).toBeLessThan(distance(seenAt(me), FACE) - R.nearer);
    m.arrived('me', 0, true);
    m.arrived('other', 300, false);
    const frames = run(m, 0, R.greetAfterMs + 1000, [me, other]);
    expect(frames.filter((f) => f.attending !== null).every((f) => f.attending === 'me')).toBe(true);
    expect(frames.filter((f) => f.hooted)).toHaveLength(1);
    // Its greeting over, it looks at whichever is nearest.
    expect(m.frame(R.newcomerMs + 500, [me, other]).attending).toBe('other');
  });

  it('looks at an owl back from one of the hall’s own ways, and does not hoot at it', () => {
    const m = mind();
    const me = owl('me', IN_FRONT);
    m.arrived('me', 0, false);
    const frames = run(m, 0, 6000, [me]);
    expect(frames.some((f) => f.hooted)).toBe(false);
    expect(frames.at(-1)).toMatchObject({ attending: 'me', dozing: false });
  });

  it('answers a hoot with its own, a moment later, and lifts its head to do it', () => {
    const m = mind();
    const me = owl('me', IN_FRONT);
    m.arrived('me', 0, false);
    run(m, 0, 4000, [me]);
    const before = m.frame(4000, [me]).head.dy;
    m.called('me', 'hoot', 4000);
    const frames = run(m, 4016, 4016 + R.answerAfterMs + R.hootMs, [me]);
    const i = frames.findIndex((f) => f.hooted);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(4016 + i * 16 - 4000).toBeGreaterThanOrEqual(R.answerAfterMs);
    expect(4016 + i * 16 - 4000).toBeLessThan(R.answerAfterMs + 40);
    expect(Math.min(...frames.slice(i).map((f) => f.head.dy))).toBeLessThan(before - HEAD_REACH.hoot * 0.4);
  });

  it('gives a crowd’s hoots one answer, and a later hoot its own', () => {
    const m = mind();
    const owls = [owl('a', IN_FRONT), owl('b', { x: IN_FRONT.x + 200, y: IN_FRONT.y }), owl('c', { x: IN_FRONT.x - 200, y: IN_FRONT.y })];
    m.arrived('a', 0, false);
    run(m, 0, 3000, owls);
    m.called('a', 'hoot', 3000);
    m.called('b', 'hoot', 3100);
    m.called('c', 'hoot', 3200);
    expect(run(m, 3000, 6000, owls).filter((f) => f.hooted)).toHaveLength(1);
    // Hooted to again straight after its own: it answers, but not before its breath is back.
    const last = 3000 + R.answerAfterMs;
    m.called('b', 'hoot', 6000);
    const again = run(m, 6016, 9000, owls);
    expect(again.filter((f) => f.hooted)).toHaveLength(1);
    expect(6016 + again.findIndex((f) => f.hooted) * 16 - last).toBeGreaterThanOrEqual(R.hootGapMs);
    expect(m.hooted).toBe(2);
  });

  it('answers a bow with a bow and a tilt with a tilt', () => {
    const m = mind();
    const me = owl('me', IN_FRONT);
    m.arrived('me', 0, false);
    const settled = run(m, 0, 4000, [me]).at(-1)!.head;
    m.called('me', 'bow', 4000);
    const bow = run(m, 4016, 4016 + R.answerAfterMs + R.bowMs, [me]);
    expect(Math.max(...bow.map((f) => f.head.dy))).toBeGreaterThan(settled.dy + HEAD_REACH.bow * 0.5);
    expect(bow.some((f) => f.hooted)).toBe(false);
    const rested = run(m, 6000, 9000, [me]).at(-1)!.head;
    m.called('me', 'tilt', 9000);
    const tilt = run(m, 9016, 9016 + R.answerAfterMs + R.tiltMs, [me]);
    expect(Math.max(...tilt.map((f) => Math.abs(f.head.roll)))).toBeGreaterThan(Math.abs(rested.roll) + HEAD_REACH.tilt * 0.5);
  });

  it('answers the emotes that are calls, and no others', () => {
    expect(CALLS).toEqual({ hoot: 'hoot', bow: 'bow', tilt: 'tilt' });
    expect(CALLS['dance']).toBeUndefined();
  });

  it('attends to the owl that called over one that is nearer, for a while, then to the nearest again', () => {
    const m = mind();
    const near = owl('near', IN_FRONT);
    const far = owl('far', { x: GUARDIAN_AT.x + 1300, y: GUARDIAN_AT.y });
    m.arrived('near', 0, false);
    expect(run(m, 0, 9000, [near, far]).at(-1)!.attending).toBe('near');
    m.called('far', 'hoot', 9000);
    expect(m.frame(9100, [near, far]).attending).toBe('far');
    expect(m.frame(9000 + R.callHoldMs + 100, [near, far]).attending).toBe('near');
  });

  it('does not flick between two owls about as near: another takes its eye only when clearly nearer', () => {
    const m = mind();
    const a = owl('a', { x: FACE.x - 300, y: FACE.y + 500 });
    const b = owl('b', { x: FACE.x + 300, y: FACE.y + 500 });
    m.arrived('a', 0, false);
    run(m, 0, R.newcomerMs + 500, [a]);
    // b walks in a little nearer than a: not enough.
    const closer = owl('b', { x: FACE.x + 300 - R.nearer / 3, y: FACE.y + 500 });
    expect(m.frame(R.newcomerMs + 600, [a, closer]).attending).toBe('a');
    expect(distance(seenAt(b), FACE)).toBeCloseTo(distance(seenAt(a), FACE), 6);
    // Much nearer: it looks at b.
    const close = owl('b', { x: FACE.x + 60, y: FACE.y + 300 });
    expect(m.frame(R.newcomerMs + 700, [a, close]).attending).toBe('b');
  });

  it('dozes when no owl has been in sight a while, and wakes as one comes back', () => {
    const m = mind();
    const here = owl('me', IN_FRONT);
    const away = owl('me', { x: 300, y: GUARDIAN_AT.y });
    expect(distance(seenAt(away), FACE)).toBeGreaterThan(R.sightLost);
    m.arrived('me', 0, false);
    run(m, 0, 4000, [here]);
    // Gone to the far end of the hall: it watches the place a while, then its eyes close.
    expect(m.frame(4000 + R.dozeAfterMs - 200, [away]).dozing).toBe(false);
    const asleep = run(m, 4000 + R.dozeAfterMs + 100, 4000 + R.dozeAfterMs + 4000, [away]);
    expect(asleep.at(-1)).toMatchObject({ dozing: true, lids: 'closed', attending: null });
    // Its head has sunk a little.
    expect(asleep.at(-1)!.head.dy).toBeGreaterThan(HEAD_REACH.doze * 0.8);
    const back = run(m, 30000, 32000, [here]);
    expect(back.at(-1)).toMatchObject({ dozing: false, lids: 'open', attending: 'me' });
  });

  it('wakes at once for an owl that calls from out of sight', () => {
    const m = mind();
    const away = owl('me', { x: 300, y: GUARDIAN_AT.y });
    run(m, 0, 2000, [away]);
    expect(m.frame(2000, [away]).dozing).toBe(true);
    m.called('me', 'hoot', 2000);
    const frames = run(m, 2016, 5000, [away]);
    expect(frames.at(-1)).toMatchObject({ dozing: false, attending: 'me' });
    expect(frames.filter((f) => f.hooted)).toHaveLength(1);
  });

  it('beats while an owl rides the rising air at the heart, and watches it go up', () => {
    const m = mind();
    const walker = owl('me', IN_FRONT);
    m.arrived('me', 0, false);
    const calm = run(m, 0, 6000, [walker]);
    expect(Math.max(...calm.map((f) => f.beat))).toBeLessThan(0.7);
    const rider = owl('me', HEART.pos, 500, true);
    const riding = run(m, 6016, 9000, [rider]);
    expect(riding.at(-1)!.beat).toBeGreaterThan(0.95);
    expect(riding.at(-1)!.attending).toBe('me');
    // High over its face: its head is lifted to watch.
    expect(riding.at(-1)!.head.dy).toBeLessThan(-HEAD_REACH.up * 0.6);
    // Its breath quickens: more breaths in the same time than at rest.
    const breaths = (frames: GuardianFrame[]) => frames.filter((f, i) => i > 0 && f.breath < 0.5 && frames[i - 1]!.breath >= 0.5).length;
    expect(breaths(run(m, 9016, 19000, [rider]))).toBeGreaterThan(breaths(run(mind(), 0, 10000, [walker])) + 2);
    // Down again: the beat dies away.
    expect(run(m, 19016, 23000, [walker]).at(-1)!.beat).toBeLessThan(0.7);
  });

  it('shrugs its wings now and then with no owl on the rising air, and never while asleep', () => {
    const m = mind();
    const me = owl('me', IN_FRONT);
    m.arrived('me', 0, false);
    const awake = run(m, 0, 60000, [me]);
    const shrugs = awake.filter((f, i) => i > 0 && f.beat > 0.3 && awake[i - 1]!.beat <= 0.3).length;
    expect(shrugs).toBeGreaterThanOrEqual(3);
    expect(shrugs).toBeLessThanOrEqual(7);
    const asleep = run(mind(), 0, 60000, []);
    expect(Math.max(...asleep.map((f) => f.beat))).toBe(0);
  });

  it('blinks now and then while awake: shut for a moment, half shut on the way, open again', () => {
    const m = mind();
    const me = owl('me', IN_FRONT);
    m.arrived('me', 0, false);
    run(m, 0, 3000, [me]);
    const frames = run(m, 3004, 33000, [me], 4);
    const shut = frames.filter((f, i) => i > 0 && f.lids === 'closed' && frames[i - 1]!.lids !== 'closed').length;
    expect(shut).toBeGreaterThanOrEqual(3);
    expect(shut).toBeLessThanOrEqual(10);
    // Mostly its eyes are open.
    expect(frames.filter((f) => f.lids === 'open').length / frames.length).toBeGreaterThan(0.9);
    // Each time shut, it was half shut the frame before and is open again within a quarter of a second.
    frames.forEach((f, i) => {
      if (i === 0 || f.lids !== 'closed' || frames[i - 1]!.lids === 'closed') return;
      expect(frames[i - 1]!.lids).toBe('half');
      expect(frames.slice(i, i + 70).some((g) => g.lids === 'open')).toBe(true);
    });
  });

  it('is the same guardian every time for the same seed, and its own for another', () => {
    const play = (seed: number) => {
      const m = mind(seed);
      m.arrived('me', 0, true);
      return run(m, 0, 20000, [owl('me', IN_FRONT)]).map((f) => `${f.lids}${f.head.roll.toFixed(4)}`).join(',');
    };
    expect(play(3)).toBe(play(3));
    expect(play(3)).not.toBe(play(4));
    const a = seeded(9);
    const b = seeded(9);
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('holds the painting’s own pose when it has nothing to look at, and a frame a long time after the last moves it no further than it was going', () => {
    const m = mind();
    const f = m.frame(0, []);
    expect(f.head.roll).toBe(AT_REST.roll);
    expect(f.head.dx).toBe(AT_REST.dx);
    const me = owl('me', { x: FACE.x + 900, y: FACE.y + 300 });
    m.arrived('me', 0, false);
    m.frame(R.wakeAfterMs + 10, [me]);
    // A tab left for a minute: one long frame.
    const late = m.frame(R.wakeAfterMs + 60000, [me]);
    const goal = headToward(seenAt(me), FACE);
    expect(Math.abs(late.head.roll)).toBeLessThanOrEqual(Math.abs(goal.roll) + 1e-9);
    expect(Math.abs(late.head.dx)).toBeLessThanOrEqual(Math.abs(goal.dx) + 1e-9);
  });
});

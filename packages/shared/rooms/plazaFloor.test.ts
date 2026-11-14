import { describe, expect, it } from 'vitest';
import { edgeArt } from '../src/edges';
import { pointInPolygon } from '../src/geometry';
import { INTERACTABLES, KIND_RULES, interactablesIn } from '../src/interactables';
import { KIT_SCENE_GAP, KIT_SCENE_SPAN, KIT_STORY_MAX } from '../src/kit';
import { KIT_ART } from '../src/kitArt';
import { npcsIn } from '../src/npcs';
import { footing } from '../src/perches';
import { FLOOR_INTERACTABLES, FLOOR_PERCH_ART, FLOOR_THING_ART, PLAZA_CLUSTERS, type FloorCluster } from '../src/plazaFloor';
import { ROOM_H } from '../src/room';
import { perchTiers } from '../src/routes';
import { wayAround } from '../src/wayAround';
import { ARCADE_PLAZA, GLASS_PLAZA, GROVE_PLAZA, HOMES_PLAZA, HUB_PLAZA, INK_PLAZA, LOBBY_PLAZA, MARKET_PLAZA, getRoom } from './index';

const PLAZAS = [
  { id: 'lobby', plaza: LOBBY_PLAZA },
  { id: 'arcade', plaza: ARCADE_PLAZA },
  { id: 'homes', plaza: HOMES_PLAZA },
  { id: 'market', plaza: MARKET_PLAZA },
  { id: 'glass', plaza: GLASS_PLAZA },
  { id: 'ink', plaza: INK_PLAZA },
  { id: 'grove', plaza: GROVE_PLAZA },
  { id: 'hub', plaza: HUB_PLAZA },
];

interface Box {
  id: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Every piece of art a cluster draws: its things, its perches (with the strip in front of each) and its decor. */
function boxes(c: FloorCluster): Box[] {
  const art = (id: string, key: string, x: number, y: number, deep = 0): Box => {
    const a = KIT_ART[key]!;
    return { id, x0: x - a.w / 2, x1: x + a.w / 2, y0: y - a.h, y1: y + deep };
  };
  return [
    ...c.things.flatMap((t, i) => {
      const key = t.piece ?? FLOOR_THING_ART[t.kind];
      return key ? [art(`${c.id} thing ${i}`, key, t.x, t.y)] : [{ id: `${c.id} thing ${i}`, x0: t.x - 30, x1: t.x + 30, y0: t.y - 30, y1: t.y }];
    }),
    ...(c.perches ?? []).map((p, i) => art(`${c.id} perch ${i}`, FLOOR_PERCH_ART[p.kind].key, p.x, p.y, 40)),
    ...(c.decor ?? []).map((d, i) => art(`${c.id} decor ${i}`, d.key, d.x, d.y)),
  ];
}

const span = (bs: Box[]) => ({ x0: Math.min(...bs.map((b) => b.x0)), x1: Math.max(...bs.map((b) => b.x1)) });

describe("things to do out on the plazas' floors (Nov 8: stuff around the room, not all on the wall)", () => {
  it.each(PLAZAS)('$id has at least two little scenes out on its floor, with more than one kind of thing to do', ({ id }) => {
    const here = PLAZA_CLUSTERS.filter((c) => c.room === id);
    expect(here.length).toBeGreaterThanOrEqual(2);
    for (const c of here) expect(c.things.length, c.id).toBeGreaterThanOrEqual(1);
    expect(new Set(here.flatMap((c) => c.things.map((t) => t.kind))).size).toBeGreaterThanOrEqual(2);
  });

  it('tells one short story a scene, each scene one glance wide and apart from the next', () => {
    const ids = new Set<string>();
    for (const c of PLAZA_CLUSTERS) {
      expect(ids.has(c.id), c.id).toBe(false);
      ids.add(c.id);
      expect(c.story.length, c.id).toBeLessThanOrEqual(KIT_STORY_MAX);
      const s = span(boxes(c));
      expect(s.x1 - s.x0, c.id).toBeLessThanOrEqual(KIT_SCENE_SPAN);
    }
    for (const { id } of PLAZAS) {
      const here = PLAZA_CLUSTERS.filter((c) => c.room === id).map((c) => ({ id: c.id, ...span(boxes(c)) }));
      for (const a of here) for (const b of here) if (a !== b) expect(a.x1 + KIT_SCENE_GAP <= b.x0 || b.x1 + KIT_SCENE_GAP <= a.x0, `${a.id} and ${b.id}`).toBe(true);
    }
  });

  it('draws everything from art the kit has, inside its room', () => {
    for (const c of PLAZA_CLUSTERS) {
      const room = getRoom(c.room)!;
      for (const t of c.things) {
        const key = t.piece ?? FLOOR_THING_ART[t.kind];
        if (key) expect(KIT_ART[key], key).toBeDefined();
      }
      for (const b of boxes(c)) expect(b.x0 >= 0 && b.x1 <= room.size.w && b.y1 <= room.size.h, b.id).toBe(true);
    }
  });

  it.each(PLAZAS)("$id's scenes stand out in the plaza: off the back, where its doorways are, and out of the rings where crowds gather", ({ id, plaza }) => {
    const ring = edgeArt(getRoom(id)!.edges!.find((e) => e.id.startsWith(`${id}-ring-`))!.key);
    for (const c of PLAZA_CLUSTERS.filter((x) => x.room === id)) {
      const feet = [...c.things, ...(c.perches ?? []), ...(c.decor ?? [])];
      for (const f of feet) {
        expect(f.y, c.id).toBeGreaterThanOrEqual(ROOM_H + 100);
        expect(f.y, c.id).toBeLessThanOrEqual(plaza.front - 60);
        for (const r of plaza.rings) {
          const inRing = ((f.x - r.x) / (ring.w / 2)) ** 2 + ((f.y - r.y) / (ring.h / 2)) ** 2 < 1;
          expect(inRing, `${c.id} in the ring at ${r.x}`).toBe(false);
        }
      }
    }
  });

  it.each(PLAZAS)('$id hides nothing a visitor looks for behind a scene: no doorway, spawn, owl to talk to or other thing to use', ({ id }) => {
    const room = getRoom(id)!;
    const mine = new Set(FLOOR_INTERACTABLES.map((i) => i.id));
    const things = [
      // A moonbeam is a ring of light: a scene at its rim hides none of it.
      ...interactablesIn(id).filter((i) => !mine.has(i.id) && i.kind !== 'moonbeam').map((i) => ({ id: i.id, ...i.pos })),
      ...Object.entries(room.spawns).map(([name, p]) => ({ id: name, ...p })),
      ...room.doors.map((d) => ({ id: d.id, x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2 })),
      ...npcsIn(id).map((n) => ({ id: n.id, ...n.pos })),
    ];
    for (const c of PLAZA_CLUSTERS.filter((x) => x.room === id)) {
      for (const b of boxes(c)) for (const t of things) expect(t.x > b.x0 - 40 && t.x < b.x1 + 40 && t.y > b.y0 && t.y < b.y1, `${t.id} behind ${b.id}`).toBe(false);
    }
  });

  it.each(PLAZAS)("$id's things to use stand on the open floor, each walked to from where an owl comes in, round the stumps and logs", ({ id }) => {
    const room = getRoom(id)!;
    const ground = footing(room, 0);
    const from = room.spawns['default']!;
    for (const t of FLOOR_INTERACTABLES.filter((i) => i.room === id)) {
      expect(t.top ?? 0, t.id).toBe(0);
      expect(
        ground.walkable.some((p) => pointInPolygon(t.pos, p)),
        t.id,
      ).toBe(true);
      expect(wayAround(from, t.pos, ground.walkable, ground.shut), t.id).not.toBeNull();
    }
  });

  it.each(PLAZAS)("$id's stumps and logs are a single jump up from the floor, with floor all round to walk past them", ({ id }) => {
    const room = getRoom(id)!;
    const tiers = perchTiers(room);
    const onFloor = (p: { x: number; y: number }) => room.walkable.some((poly) => pointInPolygon(p, poly));
    for (const c of PLAZA_CLUSTERS.filter((x) => x.room === id)) {
      (c.perches ?? []).forEach((p, i) => {
        const perch = room.perches!.find((q) => q.id === (i === 0 ? `${c.id}-perch` : `${c.id}-perch-${i + 1}`))!;
        expect(perch, c.id).toBeDefined();
        expect(perch.solid).toBe(true);
        expect(tiers[perch.id], perch.id).toBe(1);
        const xs = perch.area.map((q) => q.x);
        const ys = perch.area.map((q) => q.y);
        for (let x = Math.min(...xs); x <= Math.max(...xs); x += 10) {
          expect(onFloor({ x, y: Math.max(...ys) + 40 }), `${perch.id} in front at ${x}`).toBe(true);
          expect(onFloor({ x, y: Math.min(...ys) - 40 }), `${perch.id} behind at ${x}`).toBe(true);
        }
        // Its art stands at the strip's back edge, so an owl stood on it is drawn over it.
        const piece = room.pieces!.find((q) => q.id === perch.id)!;
        expect(piece.key).toBe(FLOOR_PERCH_ART[p.kind].key);
        expect(piece.y).toBe(Math.min(...ys));
      });
    }
  });

  it('gives every new kind of thing its words and keeps a shiny thing shared, as a leaf pile is', () => {
    for (const kind of ['bird-bath', 'mushroom', 'telescope', 'shiny'] as const) {
      expect(KIND_RULES[kind].label.length).toBeGreaterThan(0);
      expect(INTERACTABLES.some((i) => i.kind === kind)).toBe(true);
    }
    expect(KIND_RULES.shiny.shared).toBe(true);
    for (const kind of ['bird-bath', 'mushroom', 'telescope'] as const) expect(KIND_RULES[kind].shared).toBe(false);
  });
});

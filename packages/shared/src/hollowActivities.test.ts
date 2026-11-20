/**
 * The Party Grove's lanterns, quiz and telescope in the Great Hollow (Dec 1 plan D5, after the owner's
 * Nov 19 "Fold into the hub"): each stands on the hollow's own floor, clear of what is already there,
 * and plays the same as on the plaza, which keeps its own on today's park.
 */
import { describe, expect, it } from 'vitest';
import {
  HALL_LANTERN_ART,
  HALL_LANTERN_AT,
  HALL_LANTERN_POSTS,
  LANTERN_BEAMS,
  LANTERN_BURN_MS,
  LANTERN_EVERY_MS,
  LANTERN_FLOOR,
  LANTERN_ROOM,
  LANTERNS,
  QUIZ_STAGES,
  QUIZ_ZONES,
  QUIZ_ZONE_IDS,
  lanternBeam,
  quizRound,
  quizStage,
  quizZoneAt,
  underBeam,
} from './activities';
import { isWalkable, pointInRect, rectCenter, type Rect } from './geometry';
import { FLOOR_INTERACTABLES } from './plazaFloor';
import type { Vec2 } from './protocol';
import { Activities, type ActivityRoom } from './roomActivities';
import { ROOMS } from '../rooms';

const HALL = 'm3-hall';
const hall = ROOMS[HALL]!;
const T0 = Date.UTC(2026, 10, 20, 18, 0, 0);
const roomOf = (id: string, positions: Record<string, Vec2>): ActivityRoom => ({ id, ids: () => Object.keys(positions), positionOf: (v: string) => positions[v] ?? null });
const overlap = (a: Rect, b: Rect, pad = 0) => a.x - pad < b.x + b.w && b.x - pad < a.x + a.w && a.y - pad < b.y + b.h && b.y - pad < a.y + a.h;
const perchBox = (area: readonly Vec2[]): Rect => {
  const xs = area.map((p) => p.x);
  const ys = area.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

describe('the Great Hollow has the Party Grove’s games', () => {
  it('keeps the plaza’s lanterns and quiz as they were for today’s park', () => {
    expect(lanternBeam(LANTERN_ROOM)).toEqual({ lanterns: LANTERNS, floor: LANTERN_FLOOR });
    expect(quizStage('hub')?.zones).toBe(QUIZ_ZONES);
    expect(Object.keys(LANTERN_BEAMS).sort()).toEqual(['hub', HALL]);
    expect(Object.keys(QUIZ_STAGES).sort()).toEqual(['hub', HALL]);
    expect(lanternBeam('grove')).toBeUndefined();
    expect(quizStage('grove')).toBeUndefined();
    expect(lanternBeam('constructor')).toBeUndefined();
  });

  it('hangs a lantern on each post, over the floor an owl lights them from', () => {
    const beam = lanternBeam(HALL)!;
    expect(beam.lanterns).toHaveLength(HALL_LANTERN_POSTS.length);
    const posts = (hall.pieces ?? []).filter((p) => p.key === HALL_LANTERN_ART);
    expect(posts.map((p) => ({ x: p.x, y: p.y }))).toEqual([...HALL_LANTERN_POSTS]);
    beam.lanterns.forEach((l, i) => {
      expect(l.pos).toEqual({ x: HALL_LANTERN_POSTS[i]!.x + HALL_LANTERN_AT.x, y: HALL_LANTERN_POSTS[i]!.y + HALL_LANTERN_AT.y });
      expect(l.pos.x).toBeGreaterThanOrEqual(beam.floor.x);
      expect(l.pos.x).toBeLessThanOrEqual(beam.floor.x + beam.floor.w);
      expect(l.pos.y).toBeLessThan(beam.floor.y);
    });
    for (const p of [beam.floor, ...[0.1, 0.5, 0.9].map((f) => ({ x: beam.floor.x + beam.floor.w * f, y: beam.floor.y + beam.floor.h / 2 }))]) {
      const at = 'w' in p ? rectCenter(p) : p;
      expect(isWalkable(at, hall.walkable)).toBe(true);
    }
    // Their glows draw over the posts they hang from.
    expect(beam.glowDepth).toBeGreaterThan(Math.max(...posts.map((p) => p.y)));
  });

  it('puts the answer plates on open floor in front of the heart', () => {
    const stage = quizStage(HALL)!;
    for (const z of QUIZ_ZONE_IDS) {
      const r = stage.zones[z];
      for (const p of [rectCenter(r), { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h }]) expect(isWalkable(p, hall.walkable)).toBe(true);
      expect(quizZoneAt(rectCenter(r), stage)).toBe(z);
      // Laid on the floor under every owl standing on them.
      expect(stage.depth).toBeLessThan(r.y);
    }
    expect(stage.stage.y).toBeLessThan(Math.min(...QUIZ_ZONE_IDS.map((z) => stage.zones[z].y)));
  });

  it('stands its lanterns, plates and telescope clear of the hollow’s roots, doorways and spawns', () => {
    const beam = lanternBeam(HALL)!;
    const stage = quizStage(HALL)!;
    const telescope = FLOOR_INTERACTABLES.find((t) => t.room === HALL && t.kind === 'telescope');
    expect(telescope).toBeDefined();
    const ours: Rect[] = [
      beam.floor,
      ...HALL_LANTERN_POSTS.map((p) => ({ x: p.x - 60, y: p.y - 300, w: 120, h: 300 })),
      ...QUIZ_ZONE_IDS.map((z) => stage.zones[z]),
      { x: telescope!.pos.x - 80, y: telescope!.pos.y - 200, w: 160, h: 200 },
    ];
    expect(isWalkable(telescope!.pos, hall.walkable)).toBe(true);
    for (const r of ours) {
      for (const p of hall.perches ?? []) expect(overlap(r, perchBox(p.area), 20), `${JSON.stringify(r)} ${p.id}`).toBe(false);
      for (const d of hall.doors) expect(overlap(r, d.rect, 20), `${JSON.stringify(r)} ${d.id}`).toBe(false);
      for (const [id, s] of Object.entries(hall.spawns)) expect(pointInRect(s, r), `${JSON.stringify(r)} ${id}`).toBe(false);
    }
  });
});

describe('the Great Hollow’s games play as the plaza’s', () => {
  it('lights the lantern by the owl, and only from the floor in front of the posts', () => {
    const beam = lanternBeam(HALL)!;
    const by = (i: number): Vec2 => ({ x: beam.lanterns[i]!.pos.x, y: beam.floor.y + 50 });
    const pos: Record<string, Vec2> = { a: by(0), b: { x: 2720, y: 1500 } };
    let now = T0;
    const acts = new Activities(roomOf(HALL, pos), () => now);
    expect(underBeam(by(0), 0, beam)).toBe(true);
    expect(acts.light('a')).toEqual({ ok: true, id: 'hall-lantern-1', full: null });
    expect(acts.lanternState().lit['hall-lantern-1']).toBe(T0 + LANTERN_BURN_MS);
    expect(acts.light('b')).toEqual({ ok: false, reason: 'far' });
    // One owl walks the row and lights them all; the row then glows.
    let full: string[] | null = null;
    for (let i = 1; i < beam.lanterns.length; i++) {
      now += LANTERN_EVERY_MS;
      pos['a'] = by(i);
      const r = acts.light('a');
      expect(r.ok).toBe(true);
      if (r.ok) full = r.full;
    }
    expect(full).toEqual(['a']);
    expect(acts.lanternState().glowUntil).toBeGreaterThan(now);
  });

  it('settles a quiz round for the owls on the right plate', () => {
    const stage = quizStage(HALL)!;
    const round = quizRound(Math.floor(T0 / 90_000) + 1);
    const wrong = QUIZ_ZONE_IDS.find((z) => z !== round.right)!;
    const pos: Record<string, Vec2> = { a: rectCenter(stage.zones[round.right]), b: rectCenter(stage.zones[wrong]), c: rectCenter(QUIZ_ZONES[round.right]) };
    let now = round.revealAt - 1;
    const acts = new Activities(roomOf(HALL, pos), () => now);
    expect(acts.quizDue()).toBeNull();
    now = round.revealAt + 10;
    const due = acts.quizDue();
    expect(due?.n).toBe(round.n);
    // The plaza's plates are no answer here.
    expect(acts.settleQuiz(due!)).toEqual({ right: round.right, winners: ['a'] });
    expect(new Activities(roomOf('grove', pos), () => now).quizDue()).toBeNull();
  });
});

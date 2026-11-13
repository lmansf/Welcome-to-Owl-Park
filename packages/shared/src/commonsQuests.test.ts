/**
 * The Great Hollow's quest owls (OP-281, OP-258): one in each of the four Commons round its rim, each
 * with a short story quest that sends an owl through its own Commons' door and back, so no Commons is a
 * dead end and the ink Commons has more to do than its leaf piles.
 */
import { describe, expect, it } from 'vitest';
import { HALL_COMMONS, HALL_ID, HALL_ROOM, clearOfRoots, courseDoor, realmDoor } from '../rooms/hollowHall';
import { distance, isWalkable } from './geometry';
import { commonsS, HALL_LEAVES, HALL_MOONBEAMS, ringAt, voteAt, type HallLevel } from './hollowOval';
import { INTERACTABLES } from './interactables';
import { NPCS, NPC_TALK_RADIUS, npcsIn, placeName, placeShown } from './npcs';
import { DAILY_POOL, QUESTS, TOWN_NPCS, WEEKLY_POOL } from './questCatalog';
import { stepTexts } from './quests';

const LEVELS = HALL_COMMONS.map((c) => c.level);
const hallOwls = npcsIn(HALL_ID);

/** The Commons a point belongs to: the one whose middle, round the rim, is nearest it. */
function commonsOf(p: { x: number; y: number }): HallLevel {
  return [...LEVELS].sort((a, b) => distance(p, ringAt(commonsS(a), 0.62)) - distance(p, ringAt(commonsS(b), 0.62)))[0]!;
}

describe("the Great Hollow's quest owls (OP-281)", () => {
  it('stand one in each Commons, the ink Commons included', () => {
    expect(hallOwls.length).toBe(4);
    expect(hallOwls.map((n) => commonsOf(n.pos)).sort()).toEqual([...LEVELS].sort());
    expect(hallOwls.some((n) => commonsOf(n.pos) === 'ink')).toBe(true);
  });

  it('stand on the floor where an owl can walk up and talk, clear of the roots', () => {
    for (const n of hallOwls) {
      expect(isWalkable(n.pos, HALL_ROOM.walkable), n.id).toBe(true);
      expect(clearOfRoots(n.pos), n.id).toBe(true);
      // Somewhere within talking distance is floor too, so the owl can be reached from every side it shows.
      expect(isWalkable({ x: n.pos.x, y: n.pos.y + NPC_TALK_RADIUS / 2 }, HALL_ROOM.walkable), `${n.id} reachable`).toBe(true);
    }
  });

  it('keep clear of the leaf piles, moonbeams, doorways, landings and vote stones, so no prompt sits on another', () => {
    const things = [
      ...HALL_LEAVES.map((l) => ['leaves ' + l.id, l.pos] as const),
      ...HALL_MOONBEAMS.map((m) => ['moonbeam ' + m.id, m.pos] as const),
      ...HALL_ROOM.doors.flatMap((d) => [['door ' + d.id, { x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2 }] as const, ...(d.labelAt ? [['sign ' + d.id, d.labelAt] as const] : [])]),
      ...Object.entries(HALL_ROOM.spawns).map(([id, p]) => ['landing ' + id, p] as const),
      ...LEVELS.filter((l) => HALL_COMMONS.find((c) => c.level === l)!.votesFor).map((l) => ['vote stone ' + l, voteAt(l)] as const),
    ];
    for (const n of hallOwls) for (const [what, p] of things) expect(distance(n.pos, p), `${n.id} / ${what}`).toBeGreaterThanOrEqual(250);
    // Hiding spots stay usable: an NPC owl closer than a find's clearance would take one away.
    for (const n of hallOwls) for (const p of HALL_ROOM.spots ?? []) expect(distance(n.pos, p), `${n.id} / spot`).toBeGreaterThanOrEqual(110);
    for (const n of hallOwls) for (const i of INTERACTABLES.filter((x) => x.room === HALL_ID)) expect(distance(n.pos, i.pos), `${n.id} / ${i.id}`).toBeGreaterThanOrEqual(120);
  });

  it('each give a short story quest through their own Commons door and back (or, by a realm with its own owl, round the hollow), easy enough for a first visit', () => {
    for (const n of hallOwls) {
      const c = HALL_COMMONS.find((x) => x.level === commonsOf(n.pos))!;
      // A realm with a quest owl of its own at its start may be gated: no quest given elsewhere sends an owl
      // there (realmStart.test.ts), so that Commons' quest stays in the hollow.
      const ownOwl = (room: string) => NPCS.some((x) => x.room === room && !TOWN_NPCS.includes(x));
      const ways = [c.realm?.room, c.course?.room].filter((r): r is string => !!r && !ownOwl(r));
      const quests = QUESTS.filter((q) => q.giver === n.id);
      expect(quests.length, n.id).toBeGreaterThan(0);
      for (const q of quests) {
        expect(q.cadence, q.id).toBe('story');
        expect(q.difficulty, q.id).toBe('easy');
        expect(q.requires ?? [], q.id).toEqual([]);
        expect(q.steps.length, q.id).toBeLessThanOrEqual(3);
        if (ways.length) expect(q.steps.some((s) => s.goal.kind === 'visit' && ways.includes(s.goal.room)), `${q.id} leads through its Commons`).toBe(true);
        else for (const s of q.steps) expect((s.goal as { room?: string }).room ?? HALL_ID, `${q.id} stays in the hollow`).toBe(HALL_ID);
        // It ends back with its giver, so the owl comes home through the hollow.
        expect(q.steps.at(-1)!.goal, q.id).toEqual({ kind: 'emote', emote: 'hoot', npc: n.id });
      }
    }
    // The doors those quests lead through are open ways, not grown over.
    for (const c of HALL_COMMONS) for (const way of [c.realm ? realmDoor(c.level) : null, c.course ? courseDoor(c.level) : null]) if (way) expect(HALL_ROOM.doors.some((d) => d.id === way && d.to), way).toBe(true);
  });

  it('name the places they send an owl as the gates do, never "the park"', () => {
    for (const n of hallOwls)
      for (const q of QUESTS.filter((x) => x.giver === n.id))
        for (const w of [...stepTexts(q), q.offer]) {
          expect(w, q.id).not.toMatch(/the park\b/);
          expect(w.toLowerCase(), q.id).not.toMatch(/grown.?ups?|little one/);
        }
    expect(placeName('brush-1')).toBe('Brushstroke Bridges');
    expect(placeName('canopy-1')).toBe('Updraft Canopy');
    expect(placeName('circuit-1')).toBe('Blackout Circuit');
    expect(placeShown('glass', 3)).toBe('the glass realm');
  });

  it("leave the town's daily and weekly quests as they were: the hollow's owls give only their own", () => {
    for (const n of hallOwls) expect(TOWN_NPCS.map((t) => t.id), n.id).not.toContain(n.id);
    for (const q of [...DAILY_POOL, ...WEEKLY_POOL]) expect(hallOwls.map((n) => n.id), q.id).not.toContain(q.giver);
    expect(new Set(NPCS.map((n) => n.id)).size).toBe(NPCS.length);
    expect(new Set(NPCS.map((n) => n.name)).size).toBe(NPCS.length);
  });
});

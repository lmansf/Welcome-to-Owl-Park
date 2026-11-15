import { describe, expect, it } from 'vitest';
import { ROOMS } from '../rooms';
import { doorTarget } from './doorways';
import { INTERACTABLES } from './interactables';
import { NPC_TALK_RADIUS, NPCS, placeName } from './npcs';
import { QUESTS, TOWN_NPCS } from './questCatalog';
import { distance as _d, isWalkable } from './geometry';
import { LOBBY_ROOM } from './wayout';

const distance = _d;

describe('the front entrance’s quest owl (OP-281)', () => {
  const lobby = ROOMS[LOBBY_ROOM]!;
  const owls = NPCS.filter((n) => n.room === LOBBY_ROOM);

  it('stands on the Treetop Commons’ floor where an owl can walk up and talk', () => {
    expect(owls.map((n) => n.id)).toEqual(['maple']);
    for (const n of owls) {
      expect(isWalkable(n.pos, lobby.walkable), n.id).toBe(true);
      expect(isWalkable({ x: n.pos.x, y: n.pos.y + NPC_TALK_RADIUS / 2 }, lobby.walkable), `${n.id} reachable`).toBe(true);
    }
  });

  it('keeps clear of the doorways, the landings and every thing to use, so no prompt sits on another', () => {
    for (const n of owls) {
      for (const d of lobby.doors) expect(distance(n.pos, { x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2 }), `${n.id} / door ${d.id}`).toBeGreaterThanOrEqual(250);
      for (const [id, p] of Object.entries(lobby.spawns)) expect(distance(n.pos, p), `${n.id} / landing ${id}`).toBeGreaterThanOrEqual(250);
      for (const i of INTERACTABLES.filter((x) => x.room === LOBBY_ROOM)) expect(distance(n.pos, i.pos), `${n.id} / ${i.id}`).toBeGreaterThanOrEqual(120);
    }
  });

  it('gives a short first quest there, easy for a first visit, whose thanks points in through the turnstiles', () => {
    const q = QUESTS.find((x) => x.giver === 'maple')!;
    expect(q).toMatchObject({ id: 'story-maple-first', cadence: 'story', difficulty: 'easy' });
    expect(q.steps.length).toBeLessThanOrEqual(3);
    expect(q.requires ?? []).toEqual([]);
    expect(q.thanks).toMatch(/turnstiles/);
    // Its own quest only: the town's daily and weekly pools are as they were.
    expect(TOWN_NPCS.some((n) => n.id === 'maple')).toBe(false);
    expect(QUESTS.filter((x) => x.giver === 'maple' && x.cadence !== 'story')).toEqual([]);
  });
});

describe('a quest step in the arcade (OP-281)', () => {
  it('one story quest sends an owl to find Neon Roost, the arcade, named as the map and the doorway’s sign name it', () => {
    const steps = QUESTS.flatMap((q) => q.steps.map((s) => ({ q, goal: s.goal })));
    const toArcade = steps.filter(({ goal }) => goal.kind === 'visit' && goal.room === 'arcade');
    expect(toArcade.map(({ q }) => q.id)).toEqual(['story-flicker-arcade']);
    expect(placeName('arcade')).toBe('Neon Roost, the arcade');
    expect(placeName(LOBBY_ROOM)).toBe('the Treetop Commons');
    expect(placeName('homes')).toBe('the nests’ street');
  });

  it('every room the new map walks to from the entrance has a quest owl, a quest step or a game (or says why not)', () => {
    const rooms = new Set<string>();
    const queue = [LOBBY_ROOM];
    while (queue.length > 0) {
      const r = queue.shift()!;
      rooms.add(r);
      for (const d of ROOMS[r]?.doors ?? []) {
        const next = doorTarget(d, 3)?.room;
        if (next && ROOMS[next] && !rooms.has(next) && !queue.includes(next)) queue.push(next);
      }
    }
    const steps = QUESTS.flatMap((q) => q.steps.map((s) => s.goal));
    const hasStep = (r: string) => steps.some((g) => ('room' in g && g.room === r) || (g.kind === 'talk' && NPCS.find((n) => n.id === g.npc)?.room === r));
    const hasOwl = (r: string) => NPCS.some((n) => n.room === r);
    const hasGame = (r: string) => (ROOMS[r]?.doors ?? []).some((d) => d.id.startsWith('cabinet-') || d.id === 'portal') || !!ROOMS[r]?.course;
    const without = [...rooms].filter((r) => !hasStep(r) && !hasOwl(r) && !hasGame(r));
    expect(without).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { ANCHORS, ROOMS } from '../rooms';
import { pointInPolygon } from './geometry';
import { interactablesIn } from './interactables';
import { KIT_ART } from './kitArt';
import { NPC_TALK_RADIUS, npcsIn } from './npcs';
import { QUESTS, TOWN_NPCS } from './questCatalog';
import { START_FLOOR, START_OPENINGS, START_SPOTS, START_VOTE } from './realmStart';
import { ROOM_H, ROOM_W } from './room';

/** The realms whose start is laid out on the template so far (OP-276: the stained-glass realm first, for the owner to look at before the rest). */
const STARTS = ['glass'] as const;

const onFloor = (p: { x: number; y: number }) => pointInPolygon(p, START_FLOOR);
const inRect = (p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

describe("every realm's start, one screen from above (OP-276)", () => {
  it("lays out the template as wireframe 1 does: the floor between the two openings, the guardian over the vote spot, the pieces' feet on the floor's back edge", () => {
    const { back, on } = START_OPENINGS;
    // The openings stand at the floor's back edge, the knot-hole on the left and the way on on the right.
    expect(back.x + back.w).toBeLessThan(START_SPOTS.questPost.x);
    expect(on.x).toBeGreaterThan(START_SPOTS.tradingNest.x);
    expect(onFloor({ x: back.x + back.w / 2, y: back.y + back.h + 10 })).toBe(true);
    expect(onFloor({ x: on.x + on.w / 2, y: on.y + on.h + 10 })).toBe(true);
    // The vote spot is front and centre, right under the guardian's foot, and all of it is floor.
    expect(Math.abs(START_VOTE.x + START_VOTE.w / 2 - START_SPOTS.idol.x)).toBeLessThanOrEqual(5);
    expect(START_VOTE.y).toBeGreaterThanOrEqual(START_SPOTS.idol.y);
    for (const c of [{ x: START_VOTE.x, y: START_VOTE.y }, { x: START_VOTE.x + START_VOTE.w, y: START_VOTE.y + START_VOTE.h }]) expect(onFloor(c)).toBe(true);
    // Nothing stands on floor an owl walks behind it on: the guardian's base and the pieces' feet are the floor's edge.
    expect(onFloor({ x: START_SPOTS.idol.x, y: START_SPOTS.idol.y - 10 })).toBe(false);
    expect(onFloor({ x: START_SPOTS.questPost.x, y: START_SPOTS.questPost.y - 10 })).toBe(false);
    expect(START_SPOTS.decor.length).toBeGreaterThanOrEqual(3);
    expect(START_SPOTS.decor.length).toBeLessThanOrEqual(5);
  });

  for (const realm of STARTS) {
    describe(realm, () => {
      const room = ROOMS[realm]!;

      it('is one screen, painted by its start-screen slot, its floor the template', () => {
        expect(room.size).toEqual({ w: ROOM_W, h: ROOM_H });
        expect(room.backgrounds).toEqual([{ key: `kit-${realm}-start-screen`, x: 0, y: 0 }]);
        expect(KIT_ART[`kit-${realm}-start-screen`]?.slot).toBe('start-screen');
        expect(room.walkable).toEqual([START_FLOOR]);
      });

      it('leads where it did: the knot-hole back to the tree, the vote spot, and the way on to its course', () => {
        const [back, idol, on] = room.doors;
        expect(back!.id).toBe('to-hub');
        expect(back!.to).toEqual({ room: 'hub', spawn: 'from-glass' });
        expect(back!.toTree).toEqual({ room: 'l3', spawn: 'glass' });
        expect(back!.toNew).toEqual({ room: 'm3-hall', spawn: 'from-glass' });
        expect(idol!.id).toBe('idol');
        expect(idol!.rect).toEqual(START_VOTE);
        expect(on!.id).toBe('portal');
        expect(ANCHORS[realm]!['idol']).toEqual({ x: START_SPOTS.idol.x, y: START_SPOTS.idol.y });
        for (const spawn of Object.values(room.spawns)) {
          expect(onFloor(spawn)).toBe(true);
          for (const d of room.doors) expect(inRect(spawn, d.rect)).toBe(false);
        }
      });

      it('draws its quest post, trading nest and decor from its kit slots, at the template spots', () => {
        const pieces = room.pieces ?? [];
        expect(pieces.find((p) => p.id === 'quest-post')).toMatchObject({ key: `kit-${realm}-quest-post`, x: START_SPOTS.questPost.x, y: START_SPOTS.questPost.y });
        expect(pieces.find((p) => p.id === 'trading-nest')).toMatchObject({ key: `kit-${realm}-trading-nest`, x: START_SPOTS.tradingNest.x, y: START_SPOTS.tradingNest.y });
        const decor = pieces.filter((p) => p.id.startsWith('decor-'));
        expect(decor.length).toBeGreaterThanOrEqual(3);
        for (const p of pieces) {
          expect(KIT_ART[p.key], p.key).toBeDefined();
          expect(p.key.startsWith(`kit-${realm}-`), p.key).toBe(true);
        }
        for (const d of decor) expect(KIT_ART[d.key]!.slot).toBe('decor');
      });

      it('has something to do: a quest owl at the post with a quest of its own about this start, and a leaf pile', () => {
        const owls = npcsIn(realm);
        expect(owls).toHaveLength(1);
        const owl = owls[0]!;
        expect(onFloor(owl.pos)).toBe(true);
        expect(owl.pos.y).toBeGreaterThan(START_SPOTS.questPost.y);
        expect(Math.abs(owl.pos.x - START_SPOTS.questPost.x)).toBeLessThanOrEqual(NPC_TALK_RADIUS);
        // It wears a hat: the realm's, standing in until its artist's realm hat is delivered.
        expect(owl.look.wear?.head).toBeTruthy();
        const leaves = interactablesIn(realm).filter((i) => i.kind === 'leaf-pile');
        expect(leaves.length).toBeGreaterThanOrEqual(1);
        for (const l of leaves) expect(onFloor(l.pos)).toBe(true);
        const own = QUESTS.filter((q) => q.giver === owl.id);
        expect(own.length).toBeGreaterThanOrEqual(1);
        expect(own.some((q) => q.steps.some((s) => s.goal.kind === 'interact' && s.goal.what === 'leaf-pile' && s.goal.room === realm))).toBe(true);
      });

      it('is not one of the open town, so no quest given elsewhere sends an owl to its door (a realm may be gated)', () => {
        expect(TOWN_NPCS.some((n) => n.room === realm)).toBe(false);
        const owl = npcsIn(realm)[0]!;
        for (const q of QUESTS.filter((q) => q.giver !== owl.id)) {
          for (const s of q.steps) {
            const g = s.goal as { npc?: string; room?: string };
            expect(g.npc, q.id).not.toBe(owl.id);
            expect(g.room, q.id).not.toBe(realm);
          }
        }
      });
    });
  }
});

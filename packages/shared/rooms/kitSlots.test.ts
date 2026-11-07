import { describe, expect, it } from 'vitest';
import { kitDrawPlan } from '../src/kit';
import { KIT_ART, isRealmSlotKey, kitFilesOf, kitSlotBase, kitSlotKey } from '../src/kitArt';
import { KIT_REALMS, KIT_SLOT_SPECS, KIT_SLOTS, type KitRealm } from '../src/kitCatalog';
import { KIT_SLOT_RENAMES, inRealmKit } from '../src/kitSlots';
import type { RoomDef } from '../src/room';
import { BRUSH_COURSE } from './brushstrokeBridges';
import { ROOMS } from './index';
import { CIRCUIT_COURSE } from './neonCourse';
import { CANOPY_COURSE } from './updraftCanopy';

/** Every kit key a room or course names, anywhere in it. */
const kitKeys = (v: unknown, out = new Set<string>()): Set<string> => {
  if (typeof v === 'string') {
    if (v.startsWith('kit-')) out.add(v);
  } else if (Array.isArray(v)) v.forEach((x) => kitKeys(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => kitKeys(x, out));
  return out;
};

const REALM_COURSES: Array<[KitRealm, typeof CANOPY_COURSE]> = [
  ['clearing', CANOPY_COURSE],
  ['ink', BRUSH_COURSE],
  ['neon', CIRCUIT_COURSE],
];

describe("the realm kit's slots (OP-275)", () => {
  it('has all 28 slots of the realm asset list for every realm, each a key of the kit', () => {
    expect(KIT_SLOTS).toHaveLength(28);
    expect(KIT_SLOTS).toContain('wind-current');
    expect(KIT_SLOT_SPECS['perch-mid']).toMatchObject({ w: 320, h: 120, deliverW: 640, deliverH: 240, opaque: false, repeat: 'x' });
    expect(KIT_SLOT_SPECS['texture-ground']).toMatchObject({ w: 512, h: 512, opaque: true, repeat: 'xy' });
    for (const realm of KIT_REALMS) {
      for (const slot of KIT_SLOTS) {
        const spec = KIT_ART[kitSlotKey(realm, slot)];
        expect(spec, `${realm} ${slot}`).toBeDefined();
        expect(spec!.slot).toBe(slot);
      }
    }
  });

  it("names every piece of a realm's course by its slots, and nothing else", () => {
    for (const [realm, course] of REALM_COURSES) {
      const rooms = [...course.acts, ...(course.rooms ?? [])].map((id) => ROOMS[id]!);
      const named = new Set([...kitKeys(course), ...rooms.flatMap((r) => [...kitKeys(r)])]);
      const off = [...named].filter((k) => !isRealmSlotKey(realm, k));
      expect(off, realm).toEqual([]);
      // And something of nearly every slot a course has is in it: the pieces stand in for them.
      expect(new Set([...named].map(kitSlotBase)).size, realm).toBeGreaterThanOrEqual(10);
    }
  });

  it('keeps each realm looking as it did until its art is delivered: each stand-in shows the piece it stands in for, at its size', () => {
    for (const realm of KIT_REALMS) {
      for (const [piece, key] of Object.entries(KIT_SLOT_RENAMES[realm])) {
        const was = KIT_ART[piece]!;
        const now = KIT_ART[key]!;
        expect(kitFilesOf(key), key).toBe(piece);
        const { slot: _s, standIn: _i, ...rest } = now;
        expect(rest, key).toEqual(was);
      }
    }
    // A room laid out of today's pieces (the first act of the ink course, its pieces named as they
    // were, and a ledge of a recut row) is drawn the same, box for box, under its slots.
    const unslot = (v: unknown): unknown =>
      typeof v === 'string' ? (KIT_ART[v]?.standIn ?? v) : Array.isArray(v) ? v.map(unslot) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unslot(x)])) : v;
    const act = unslot(ROOMS['brush-1']!) as RoomDef;
    const room: RoomDef = { ...act, kit: { ...act.kit!, ledges: [...(act.kit!.ledges ?? []), { id: 'row-test', x0: 4000, x1: 4700, top: 300, row: 'kit-cut-stone' }] } };
    expect([...kitKeys(room)].some((k) => k.includes('--'))).toBe(false);
    // A decal's id is its piece's key and place in the list; the rest is where and how it is drawn.
    const box = (plan: ReturnType<typeof kitDrawPlan>) => plan.map(({ key, id, ...rest }) => ({ ...rest, key: kitFilesOf(key), id: rest.role === 'decal' ? kitFilesOf(id.replace(/-\d+$/, '')) : id }));
    const slotted = inRealmKit('ink', room);
    expect([...kitKeys(slotted)].filter((k) => !isRealmSlotKey('ink', k))).toEqual([]);
    expect(box(kitDrawPlan(slotted))).toEqual(box(kitDrawPlan(room)));
  });
});

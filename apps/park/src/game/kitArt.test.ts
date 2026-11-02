import { KIT_ART, ROOM_W, kitArtKeys, kitCost, type RoomDef } from '@owl-park/shared';
import { KIT_DEMOS } from '@owl-park/shared/rooms/kit';
import { describe, expect, it, vi } from 'vitest';
import { ROOMS } from '../rooms';
import { ART, artScale, roomArtCap, roomArtKeys } from './art';
import { PHONE_ROOM_BUDGET, rasterNames } from './artFiles';
import { drawnRoom } from './kitView';

// Only which art a kit room asks for is worked out here; no Phaser runs.
vi.mock('phaser', () => ({ default: {} }));

const shipping = (...names: string[]) => new Map(names.map((n, i) => [n, `h${i}`]));
const phone = { pixelRatio: 2, artScaleMax: 1.5, roomArtBudget: PHONE_ROOM_BUDGET };

describe('the art kit in the park (OP-234)', () => {
  const demo = KIT_DEMOS['l4']!;
  const painted = ROOMS['l4']!;

  it('knows every kit piece as art of its own kind, at its logical size', () => {
    for (const [key, spec] of Object.entries(KIT_ART)) expect(ART[key], key).toEqual({ w: spec.w, h: spec.h, kind: 'kit' });
  });

  it('looks a kit key up like any other art: its shipped files, best first, or none (its placeholder)', () => {
    expect(rasterNames('kit-tex-bark', 2, shipping('kit-tex-bark.webp', 'kit-tex-bark@2x.webp'))).toEqual(['kit-tex-bark@2x.webp', 'kit-tex-bark.webp']);
    expect(rasterNames('kit-cap-plank', 1, shipping('kit-cap-plank.png'))).toEqual(['kit-cap-plank.png']);
    expect(rasterNames('kit-door-arch', 1, shipping())).toEqual([]);
  });

  it('draws the painted level unless the page asks for kit rooms', () => {
    expect(drawnRoom(painted, { kit: false })).toBe(painted);
    expect(drawnRoom(painted, { kit: true })).toBe(demo);
    expect(drawnRoom(ROOMS['hub']!, { kit: true })).toBe(ROOMS['hub']);
    const own: RoomDef = { ...demo, id: 'own-kit' };
    expect(drawnRoom(own, { kit: false })).toBe(own);
  });

  it("loads a kit room's pieces and backdrops once each, and no paintings", () => {
    const keys = roomArtKeys('l4', demo);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...kitArtKeys(demo)].sort());
    expect(keys.filter((k) => !k.startsWith('kit-'))).toEqual([]);
    expect(roomArtKeys('l4', painted).filter((k) => k.startsWith('kit-'))).toEqual([]);
  });

  it("keeps a kit room within a phone's budget for one room's art, and its draw to a few hundred images", () => {
    const cap = roomArtCap(demo, phone);
    const cost = kitCost(demo, artScale('kit', phone.pixelRatio, cap));
    expect(cost.bytes).toBeLessThanOrEqual(PHONE_ROOM_BUDGET);
    expect(cost.images).toBeLessThanOrEqual(400);
    // Lighter than the painted level it stands in for: that is twelve screens of art.
    expect(cost.bytes).toBeLessThan(roomArtKeys('l4', painted).length * ROOM_W * 900 * 4);
  });
});

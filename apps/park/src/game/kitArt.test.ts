import { KIT_ART, ROOM_W, kitArtKeys, kitCost, kitFilesOf, type RoomDef } from '@owl-park/shared';
import { KIT_DEMOS } from '@owl-park/shared/rooms/kit';
import { describe, expect, it, vi } from 'vitest';
import { ROOMS } from '../rooms';
import { ART, artScale, roomArtCap, roomArtKeys, slotDelivered } from './art';
import { PHONE_ROOM_BUDGET, rasterNames } from './artFiles';
import { drawnRoom } from './kitView';

// Only which art a kit room asks for is worked out here; no Phaser runs.
vi.mock('phaser', () => ({ default: {} }));

const shipping = (...names: string[]) => new Map(names.map((n, i) => [n, `h${i}`]));
const phone = { pixelRatio: 2, artScaleMax: 1.5, roomArtBudget: PHONE_ROOM_BUDGET };

describe('the art kit in the park (OP-234)', () => {
  const demo = KIT_DEMOS['l4']!;
  const painted = ROOMS['l4']!;

  it('knows every kit piece as the published kit’s own art (OP-229, OP-241), at the size the assembler lays it out at', () => {
    for (const [key, spec] of Object.entries(KIT_ART)) {
      const art = ART[key];
      expect(art, key).toBeDefined();
      // A realm slot's key and its stand-ins (OP-275) draw the kit's placeholder until art comes.
      expect(art, key).toEqual({ w: spec.w, h: spec.h, kind: spec.slot ? 'kit' : spec.kind });
    }
  });

  it('looks a kit key up like any other art: its shipped files, best first, or none (its placeholder)', () => {
    expect(rasterNames('kit-tex-bark', 2, shipping('kit-tex-bark.webp', 'kit-tex-bark@2x.webp'))).toEqual(['kit-tex-bark@2x.webp', 'kit-tex-bark.webp']);
    expect(rasterNames('kit-plank-mid', 1, shipping('kit-plank-mid.png'))).toEqual(['kit-plank-mid.png']);
    expect(rasterNames('kit-doorway-stone', 1, shipping())).toEqual([]);
  });

  it("loads a realm slot's stand-in from the piece standing in, until the slot's own art is published (OP-275)", () => {
    expect(kitFilesOf('kit-clearing-plant--clearing-fern-clump')).toBe('kit-clearing-fern-clump');
    expect(kitFilesOf('kit-clearing-plant')).toBe('kit-clearing-fern-clump');
    expect(kitFilesOf('kit-glass-plant')).toBe('kit-glass-plant');
    expect(kitFilesOf('kit-tex-bark')).toBe('kit-tex-bark');
    // A slot's own art counts once it is delivered: published, and no piece standing in for it any more.
    expect(slotDelivered('kit-ink-wind-current', shipping())).toBe(false);
    expect(slotDelivered('kit-ink-wind-current', shipping('kit-ink-wind-current.webp'))).toBe(true);
    expect(slotDelivered('kit-clearing-updraft', shipping('kit-clearing-updraft.webp'))).toBe(false);
    expect(slotDelivered('kit-tex-bark', shipping('kit-tex-bark.webp'))).toBe(false);
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

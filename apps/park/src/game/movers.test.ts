import { describe, expect, it, vi } from 'vitest';
import { distance, hiddenPieces } from '@owl-park/shared';
import { ROOMS } from '@owl-park/shared/rooms';
import { FLAGS, flagOn } from '../flags';
import { ART } from './art';
import { carryOn, arrivalAir } from '@owl-park/shared';
import { INTO_HOLE_PX, INTO_MOUTH_MS, MOVER_ART, MOVER_FADE_IN_MS, MOVER_WORDS, headingOf, roomWithMovers, streamerSpots } from './movers';

// The art list comes with the engine it draws with: nothing here draws.
vi.mock('phaser', () => ({ default: {} }));

describe('the movers on a page (OP-287)', () => {
  it('are behind a flag of their own: off unless the address asks', () => {
    expect(FLAGS.movers.param).toBe('movers');
    expect(flagOn('movers', '')).toBe(false);
    expect(flagOn('movers', '?movers=0')).toBe(false);
    expect(flagOn('movers', '?room=m3-hall&movers=1')).toBe(true);
  });

  it('the room drawn with them on has no hatch: the knot hole stands in its place, and every other piece stays', () => {
    const hall = ROOMS['m3-hall']!;
    const shown = roomWithMovers(hall);
    expect(hall.pieces!.map((p) => p.id)).toContain('root-hatch');
    expect(shown.pieces!.map((p) => p.id)).not.toContain('root-hatch');
    expect(shown.pieces!.length).toBe(hall.pieces!.length - hiddenPieces(hall.movers).length);
    // The doorway itself stays: its sign, its glint and the trail all read it.
    expect(shown.doors).toBe(hall.doors);
    // A room whose movers hide nothing, and one with none, is the room itself.
    expect(roomWithMovers(ROOMS['arcade']!)).toBe(ROOMS['arcade']);
    expect(roomWithMovers(ROOMS['lobby']!)).toBe(ROOMS['lobby']);
  });

  it('the three new pieces are in the art list with their sizes, to be painted', () => {
    expect(ART[MOVER_ART.mouth]).toEqual({ w: 240, h: 120, kind: 'piece' });
    expect(ART[MOVER_ART.column]).toEqual({ w: 260, h: 420, kind: 'piece' });
    expect(ART[MOVER_ART.streamers]).toEqual({ w: 400, h: 90, kind: 'piece' });
    // The mouth is the size of the hatch it takes the place of.
    expect(ART[MOVER_ART.mouth]).toEqual(ART['kit-hatch-down']);
  });

  it('a course room drawn with them on is the room itself: its doorways’ art is the realm’s knot-hole slot already, and a tunnel hides nothing', () => {
    for (const id of ['canopy-2b', 'brush-3b', 'circuit-1']) {
      expect(ROOMS[id]!.movers?.tunnels?.length, id).toBeGreaterThan(0);
      expect(roomWithMovers(ROOMS[id]!), id).toBe(ROOMS[id]);
    }
  });

  it('an owl goes into a mouth in a moment, and sinks a little into a hole under its feet', () => {
    expect(INTO_MOUTH_MS).toBeLessThan(400);
    expect(INTO_HOLE_PX).toBeGreaterThan(20);
    expect(INTO_HOLE_PX).toBeLessThan(80);
  });

  it('the room comes up for an owl that came by a mover while it is still in the air: before the top of its hop, and with most of a dive’s fall to go', () => {
    const hop = arrivalAir('tunnel');
    const dive = arrivalAir('dive');
    // Still rising as the room is fully up, and down well after.
    expect(carryOn(hop, MOVER_FADE_IN_MS).vz).toBeGreaterThan(0);
    expect(carryOn(hop, MOVER_FADE_IN_MS + 100).s).not.toBe(0);
    expect(carryOn(dive, MOVER_FADE_IN_MS).z).toBeGreaterThan(dive.z * 0.8);
    expect(MOVER_FADE_IN_MS).toBeGreaterThanOrEqual(150); // a fade, not a cut
  });

  it('a lane’s streamers stand end to end along it, the last stretch cut to fit', () => {
    const lane = ROOMS['arcade']!.movers!.lanes![0]!;
    const spots = streamerSpots(lane, 400);
    const total = distance(lane.a, lane.b);
    expect(spots.length).toBe(Math.ceil(total / 400));
    expect(spots.reduce((n, s) => n + s.length, 0)).toBeCloseTo(total, 5);
    expect(spots[0]!.at).toEqual({ x: lane.a.x + 200, y: lane.a.y });
    for (const s of spots) expect(s.at.y).toBe(lane.a.y);
    expect(streamerSpots({ ...lane, b: { x: lane.a.x + 500, y: lane.a.y } }, 400).map((s) => s.length)).toEqual([400, 100]);
  });

  it('an owl’s heading is its walk’s, else the way it is pushed, else none', () => {
    expect(headingOf({ from: { x: 0, y: 0 }, to: { x: 30, y: -10 } }, { x: -1, y: 0 })).toEqual({ x: 30, y: -10 });
    expect(headingOf(null, { x: -1, y: 0 })).toEqual({ x: -1, y: 0 });
    expect(headingOf({ from: { x: 5, y: 5 }, to: { x: 5, y: 5 } }, null)).toBeNull();
    expect(headingOf(null, { x: 0, y: 0 })).toBeNull();
    expect(headingOf(null, null)).toBeNull();
  });

  it('the lane’s line of words is the thermal’s, for a lane', () => {
    expect(MOVER_WORDS.lane).toBe('A glide lane runs here. Jump and keep holding to ride it along.');
  });
});

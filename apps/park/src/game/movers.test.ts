import { describe, expect, it, vi } from 'vitest';
import { AIRBORNE, DIVE_ARRIVAL, carryOn, distance, hiddenPieces } from '@owl-park/shared';
import { ROOMS } from '@owl-park/shared/rooms';
import { FLAGS, flagOn } from '../flags';
import { ART } from './art';
import { INTO_MOUTH_MS, MOVER_ART, MOVER_WORDS, TUNNEL_HOP, arrivalAir, headingOf, roomWithMovers, streamerSpots } from './movers';

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

  it('an owl that dived comes in over where it lands and drops; one out of a tunnel hops up out of the mouth', () => {
    const dived = arrivalAir('dive', 0);
    expect(dived).toEqual({ z: DIVE_ARRIVAL.z, vz: DIVE_ARRIVAL.vz, s: AIRBORNE, f: 0 });
    expect(carryOn(dived, 700).s).toBe(0);
    const out = arrivalAir('tunnel', 0);
    expect(out).toEqual({ z: 0, vz: TUNNEL_HOP, s: AIRBORNE, f: 0 });
    // Up a little and down again inside a second: a hop, lower than a jump.
    const top = Math.max(...[60, 120, 180, 240, 300].map((ms) => carryOn(out, ms).z));
    expect(top).toBeGreaterThan(40);
    expect(top).toBeLessThan(120);
    expect(carryOn(out, 900).s).toBe(0);
    expect(INTO_MOUTH_MS).toBeLessThan(400);
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

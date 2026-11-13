import { describe, expect, it } from 'vitest';
import {
  AIR_DASH_COOLDOWN_MS,
  AIR_DASH_DISTANCE,
  AIR_DASH_MS,
  AIR_DASH_SPEED,
  DASH_SLACK_PX,
  FRESH_DASH,
  canDash,
  dashEnd,
  dashHeading,
  dashRefusal,
  landDash,
  roomDashEnd,
  spendDash,
} from './dash';
import { GROUNDED, newFlier, stepFlier, type Flier } from './flight';
import { distance, type Polygon } from './geometry';
import { WALK_SPEED, positionAlongWalk, walkSpeed } from './walk';

const YARD: Polygon = [
  { x: 0, y: 0 },
  { x: 1000, y: 0 },
  { x: 1000, y: 400 },
  { x: 0, y: 400 },
];

describe('the dash (OP-224)', () => {
  it('is a short burst: 900 px/s for 180 ms, 162 px, three and a half walks fast', () => {
    expect(AIR_DASH_SPEED).toBe(900);
    expect(AIR_DASH_MS).toBe(180);
    expect(AIR_DASH_DISTANCE).toBe(162);
    expect(AIR_DASH_COOLDOWN_MS).toBe(350);
    expect(AIR_DASH_SPEED / WALK_SPEED).toBeCloseTo(3.46, 1);
  });

  it('is held only in a course, and taken only in the air', () => {
    expect(dashRefusal(FRESH_DASH, false, true, 1000)).toBe('not-held');
    expect(dashRefusal(FRESH_DASH, true, false, 1000)).toBe('grounded');
    expect(dashRefusal(FRESH_DASH, true, true, 1000)).toBeNull();
    expect(canDash(FRESH_DASH, true, true, 1000)).toBe(true);
  });

  it('goes once a jump: spent, it is refused until the owl stands on something again', () => {
    const spent = spendDash(FRESH_DASH, 1000);
    expect(dashRefusal(spent, true, true, 1000 + 5000)).toBe('spent');
    const back = landDash(spent);
    expect(back.spent).toBe(false);
    expect(dashRefusal(back, true, true, 1000 + AIR_DASH_COOLDOWN_MS)).toBeNull();
  });

  it('waits out its cooldown whatever the landings between', () => {
    const back = landDash(spendDash(FRESH_DASH, 1000));
    expect(dashRefusal(back, true, true, 1000 + AIR_DASH_COOLDOWN_MS - 1)).toBe('cooldown');
    expect(dashRefusal(back, true, true, 1000 + AIR_DASH_COOLDOWN_MS)).toBeNull();
  });

  it('comes back as the flight lands (flight.ts calls into the dash), and stays spent while up', () => {
    let fl: Flier = { ...newFlier(), dash: spendDash(FRESH_DASH, 0) };
    fl = stepFlier(fl, { pressed: true, held: false });
    expect(fl.air.s).not.toBe(GROUNDED);
    expect(fl.dash?.spent).toBe(true);
    for (let i = 0; i < 400 && fl.air.s !== GROUNDED; i++) fl = stepFlier(fl, { pressed: false, held: false });
    expect(fl.air.s).toBe(GROUNDED);
    expect(fl.dash?.spent).toBe(false);
    // A flier with no dash (outside a course) never gets one.
    expect(stepFlier(newFlier(), { pressed: true, held: false }).dash).toBeUndefined();
  });

  it('heads along the held keys or the stick, else the way the owl faces', () => {
    expect(dashHeading({ x: 0, y: -2 }, 1)).toEqual({ x: 0, y: -1 });
    expect(dashHeading(null, -1)).toEqual({ x: -1, y: 0 });
    expect(dashHeading({ x: 0, y: 0 }, 1)).toEqual({ x: 1, y: 0 });
    const d = dashHeading({ x: 1, y: 1 }, 1);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
  });

  it('ends AIR_DASH_DISTANCE along its heading, or where the footing ends', () => {
    expect(dashEnd({ x: 100, y: 200 }, { x: 1, y: 0 }, [YARD])).toEqual({ x: 262, y: 200 });
    const atEdge = dashEnd({ x: 950, y: 200 }, { x: 1, y: 0 }, [YARD]);
    expect(atEdge.x).toBeLessThanOrEqual(1000);
    expect(atEdge.x).toBeGreaterThan(950);
    expect(dashEnd({ x: 100, y: 200 }, { x: 0, y: 0 }, [YARD])).toEqual({ x: 100, y: 200 });
  });

  it('is taken by the room toward the point asked, no further than a dash goes', () => {
    const from = { x: 100, y: 200 };
    expect(roomDashEnd(from, { x: 900, y: 200 }, [YARD])).toEqual({ x: 100 + AIR_DASH_DISTANCE + DASH_SLACK_PX, y: 200 });
    expect(roomDashEnd(from, { x: 200, y: 200 }, [YARD])).toEqual({ x: 200, y: 200 });
    expect(distance(from, roomDashEnd(from, { x: 900, y: 900 }, [YARD]))).toBeLessThanOrEqual(AIR_DASH_DISTANCE + DASH_SLACK_PX + 1);
  });

  it('is walked at the dash’s pace by every page and the room (walkSpeed)', () => {
    expect(walkSpeed({})).toBe(WALK_SPEED);
    expect(walkSpeed({ dash: true })).toBe(AIR_DASH_SPEED);
    const walk = { from: { x: 0, y: 0 }, to: { x: AIR_DASH_DISTANCE, y: 0 }, startedAt: 0, dash: true as const };
    expect(positionAlongWalk(walk, AIR_DASH_MS / 2).pos.x).toBeCloseTo(AIR_DASH_DISTANCE / 2);
    expect(positionAlongWalk(walk, AIR_DASH_MS).done).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { LEFT_PARK_SPAWN, LOBBY_ROOM, distanceToRect, pointInRect } from '@owl-park/shared';
import { ROOMS } from '../rooms';
import { AT_GATE_PX, admitTarget, type AdmitAsk } from './gateAdmit';
import { takesDoorway } from './doors';

const lobby = ROOMS[LOBBY_ROOM]!;
const gate = lobby.doors.find((d) => d.id === 'gate')!.rect;
/** Where the turnstiles turn an owl back: straight out of the turnstile it tried, 70 below them. */
const turnedBack = { x: 2480, y: gate.y + gate.h + 70 };
const ask = (over: Partial<AdmitAsk> = {}): AdmitAsk => ({ room: LOBBY_ROOM, pos: turnedBack, gate, status: 'unused', busy: false, ...over });

describe('in through the turnstiles once the ticket comes (OP-190)', () => {
  it('an owl where the turnstiles turned it back walks back into the turnstile it tried, and that walk goes through', () => {
    const to = admitTarget(ask())!;
    expect(to).toEqual({ x: turnedBack.x, y: gate.y + gate.h / 2 });
    expect(pointInRect(to, gate)).toBe(true);
    // The walk ends in the doorway, so the turnstiles take it as they take any owl that walks in.
    expect(takesDoorway(gate, to, false, false)).toBe(true);
    // An active ticket (its time started on another screen) goes in too.
    expect(admitTarget(ask({ status: 'active' }))).toEqual(to);
  });

  it('Play back from checkout lands the owl in front of the turnstiles, near enough to go in', () => {
    const spawn = lobby.spawns[LEFT_PARK_SPAWN]!;
    expect(distanceToRect(spawn, gate)).toBeLessThanOrEqual(AT_GATE_PX);
    expect(pointInRect(admitTarget(ask({ pos: spawn }))!, gate)).toBe(true);
  });

  it('keeps the owl’s lane, inside the turnstiles’ ends', () => {
    const west = admitTarget(ask({ pos: { x: gate.x - 100, y: turnedBack.y } }))!;
    const east = admitTarget(ask({ pos: { x: gate.x + gate.w + 100, y: turnedBack.y } }))!;
    expect(west.x).toBeGreaterThan(gate.x);
    expect(east.x).toBeLessThan(gate.x + gate.w);
    expect(pointInRect(west, gate) && pointInRect(east, gate)).toBe(true);
  });

  it('does not go in by itself: wandered off, in another room, a held ticket, one that does not work, or the room busy', () => {
    expect(admitTarget(ask({ pos: { x: 190, y: 850 } }))).toBeNull();
    expect(admitTarget(ask({ pos: { x: gate.x + gate.w / 2, y: gate.y + gate.h + AT_GATE_PX + 1 } }))).toBeNull();
    expect(admitTarget(ask({ room: 'hub' }))).toBeNull();
    expect(admitTarget(ask({ gate: null }))).toBeNull();
    for (const status of ['held', 'used', 'expired', 'revoked'] as const) expect(admitTarget(ask({ status })), status).toBeNull();
    expect(admitTarget(ask({ busy: true }))).toBeNull();
  });
});

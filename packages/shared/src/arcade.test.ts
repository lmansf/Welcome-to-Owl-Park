import { describe, expect, it } from 'vitest';
import { ARCADE_ROOM, CABINETS, CABINET_OFF, cabinetAt } from './arcade';
import { CLOSED_SIGNS, ROOMS } from '../rooms';

describe('the arcade', () => {
  const room = ROOMS[ARCADE_ROOM]!;

  it('has a spot in its room data for every cabinet, and no other spot', () => {
    const spots = room.doors.filter((d) => !d.to).map((d) => d.id);
    expect(spots.sort()).toEqual(CABINETS.map((c) => c.spot).sort());
  });

  it('plays a different game at each cabinet', () => {
    expect(new Set(CABINETS.map((c) => c.game)).size).toBe(CABINETS.length);
  });

  it('says only an approved phrase on a cabinet that is off', () => {
    expect(CLOSED_SIGNS).toContain(CABINET_OFF);
  });

  it('is reached from the market street and leads back to it', () => {
    const into = ROOMS['market']!.doors.find((d) => d.to?.room === ARCADE_ROOM);
    const out = room.doors.find((d) => d.to?.room === 'market');
    expect(into && Object.hasOwn(room.spawns, into.to!.spawn)).toBe(true);
    expect(out && Object.hasOwn(ROOMS['market']!.spawns, out.to!.spawn)).toBe(true);
  });

  it('finds a cabinet only by its spot in the arcade', () => {
    expect(cabinetAt(ARCADE_ROOM, 'cabinet-flight')?.game).toBe('flight');
    expect(cabinetAt('market', 'cabinet-flight')).toBeUndefined();
    expect(cabinetAt(ARCADE_ROOM, 'to-market')).toBeUndefined();
  });
});

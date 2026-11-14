import { describe, expect, it } from 'vitest';
import { doorTarget, type DoorDef } from '@owl-park/shared';
import { HALL_ROOM, ROOMS } from '@owl-park/shared/rooms';
import { doorSpot, leadsToPlay } from './featherTrail';
import { FIRST_WAYS, firstWays, type FirstDoor } from './firstWays';
import { signedDoors } from './hints';

/** The Great Hollow's signed doorways as the rule sees them, with `tried` among them been through. */
function hallDoors(tried: readonly string[] = []): FirstDoor[] {
  return signedDoors(HALL_ROOM, 3).map((d: DoorDef) => {
    const to = ROOMS[doorTarget(d, 3)?.room ?? ''];
    return { id: d.id, spot: doorSpot(d), play: leadsToPlay(to), arcade: to?.id === 'arcade', tried: tried.includes(d.id) };
  });
}

/** Where an owl through the turnstiles comes in. */
const CAME_IN = HALL_ROOM.spawns!['from-lobby']!;

describe('the first ways: what the Great Hollow names to an owl that has not played yet (OP-370)', () => {
  it('names the arcade and the nearest course to an owl through the turnstiles, the nearer first', () => {
    const named = firstWays(CAME_IN, hallDoors());
    expect(named).toHaveLength(FIRST_WAYS);
    expect(named).toContain('down');
    // The clearing's course is the nearest gate to the knothole at the back.
    expect(named).toContain('course-grove');
    expect(named[0]).toBe('down');
  });

  it('names nothing once the owl has been through any doorway into play, this one or another', () => {
    expect(firstWays(CAME_IN, hallDoors(['down']))).toEqual([]);
    expect(firstWays(CAME_IN, hallDoors(['course-ink']))).toEqual([]);
  });

  it('still names them to an owl that has only been to a realm, the Party Grove or back up the knothole', () => {
    expect(firstWays(CAME_IN, hallDoors(['up', 'to-grove', 'to-party', 'to-glass']))).toHaveLength(FIRST_WAYS);
  });

  it('names the course nearest to where the owl came in', () => {
    // Out of the Party Grove's trunk at the front, the neon and ink gates are the near ones.
    const front = HALL_ROOM.spawns!['from-party'] ?? { x: HALL_ROOM.size.w / 2, y: HALL_ROOM.size.h - 300 };
    const named = firstWays(front, hallDoors());
    expect(named).toContain('down');
    expect(named.some((id) => id === 'course-market' || id === 'course-ink')).toBe(true);
    expect(named).not.toContain('course-grove');
  });

  it('names only doorways that lead to play, and its nearest two where a room has no arcade', () => {
    const doors: FirstDoor[] = [
      { id: 'realm', spot: { x: 10, y: 0 }, play: false, arcade: false, tried: false },
      { id: 'far-course', spot: { x: 900, y: 0 }, play: true, arcade: false, tried: false },
      { id: 'near-course', spot: { x: 200, y: 0 }, play: true, arcade: false, tried: false },
      { id: 'third-course', spot: { x: 1500, y: 0 }, play: true, arcade: false, tried: false },
    ];
    expect(firstWays({ x: 0, y: 0 }, doors)).toEqual(['near-course', 'far-course']);
    expect(firstWays({ x: 0, y: 0 }, doors.filter((d) => !d.play))).toEqual([]);
  });

  it('names as many as it is asked for and no more: one is the arcade alone, none is none', () => {
    expect(firstWays(CAME_IN, hallDoors(), 1)).toEqual(['down']);
    expect(firstWays(CAME_IN, hallDoors(), 0)).toEqual([]);
    expect(firstWays(CAME_IN, hallDoors(), 3)).toHaveLength(3);
  });
});

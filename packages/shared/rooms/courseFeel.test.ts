import { describe, expect, it } from 'vitest';
import { courseParts, courseRoomIds, doorWaitsOn, endsCourse } from '../src/course';
import { FLIGHT_STEP_MS, PARK_FLIGHT, newFlier, stepFlier } from '../src/flight';
import { PERCH_SLACK } from '../src/perches';
import { BRUSH_COURSE } from './brushstrokeBridges';
import { ROOMS } from './index';
import { CIRCUIT_COURSE } from './neonCourse';
import { CANOPY_COURSE } from './updraftCanopy';

const LIVE_COURSES = [CANOPY_COURSE, BRUSH_COURSE, CIRCUIT_COURSE];

/** How high a press of Jump held `ms` and let go rises off the floor (room px). */
function riseOf(ms: number): number {
  const held = Math.round(ms / FLIGHT_STEP_MS);
  let fl = newFlier();
  let top = 0;
  for (let i = 0; i < 240; i++) {
    fl = stepFlier(fl, { pressed: i === 0, held: i < held }, 0, PARK_FLIGHT);
    top = Math.max(top, fl.air.z);
  }
  return top;
}

/** A quick tap of a key or of the Jump button: a fifteenth of a second. Most presses are longer. */
const QUICK_TAP_MS = 67;

describe('the courses, as a new owl meets them (OP-343)', () => {
  it('a quick tap of Jump takes an owl onto the first step of every course', () => {
    const tap = riseOf(QUICK_TAP_MS);
    for (const course of LIVE_COURSES) {
      const room = ROOMS[course.acts[0]!]!;
      const start = room.spawns[course.gate.spawn]!;
      const left = (p: { area: readonly { x: number }[] }) => Math.min(...p.area.map((q) => q.x));
      const first = [...(room.perches ?? [])].filter((p) => left(p) > start.x).sort((a, b) => left(a) - left(b))[0]!;
      expect(first, course.id).toBeDefined();
      expect(first.top - PERCH_SLACK, `${room.id} ${first.id}: its top, less the slack a landing has`).toBeLessThanOrEqual(tap);
    }
  });

  it('the doorway into a room where a course only ends waits for every part: the hut, a bell short, keeps its owl outside', () => {
    const rooms = (id: string) => ROOMS[id];
    // The canopy's hut holds the finish and has no way back into the course; no other room of a course is such a dead end.
    const ends = LIVE_COURSES.flatMap((c) => courseRoomIds(c).filter((id) => endsCourse(c, id, rooms)));
    expect(ends).toEqual(['canopy-hut']);
    const bells = courseParts(CANOPY_COURSE, rooms).map((p) => p.id);
    expect(bells.length).toBeGreaterThan(1);
    // No bell rung, and one short: the doorway waits, and says how many are done.
    expect(doorWaitsOn(CANOPY_COURSE, 'canopy-hut', rooms, [])).toEqual({ done: 0, of: bells.length });
    expect(doorWaitsOn(CANOPY_COURSE, 'canopy-hut', rooms, bells.slice(1))).toEqual({ done: bells.length - 1, of: bells.length });
    // Every bell rung, or no run at all (nothing to lose): through.
    expect(doorWaitsOn(CANOPY_COURSE, 'canopy-hut', rooms, bells)).toBeNull();
    expect(doorWaitsOn(CANOPY_COURSE, 'canopy-hut', rooms, null)).toBeNull();
    // Any other doorway of the course: through, whatever the run has.
    expect(doorWaitsOn(CANOPY_COURSE, 'canopy-3', rooms, [])).toBeNull();
    // A room that ends a course is entered from the course itself, so the doorway that waits is one an owl with a run meets.
    const into = courseRoomIds(CANOPY_COURSE).filter((id) => ROOMS[id]!.doors.some((d) => d.to?.room === 'canopy-hut'));
    expect(into).toEqual(['canopy-3']);
  });
});

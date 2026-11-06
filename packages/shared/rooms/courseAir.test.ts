import { describe, expect, it } from 'vitest';
import { airTiers } from '../src/routes';
import { windProblems } from '../src/wind';
import { BRUSH_COURSE } from './brushstrokeBridges';
import { COURSE_AIR } from './courseAir';
import { COURSES, ROOMS } from './index';
import { CIRCUIT_COURSE } from './neonCourse';
import { CANOPY_COURSE } from './updraftCanopy';

describe("the courses' air (OP-275)", () => {
  it('puts its updrafts and wind currents in course rooms, with nothing wrong with a current', () => {
    for (const [id, air] of Object.entries(COURSE_AIR)) {
      const r = ROOMS[id];
      expect(r?.course, id).toBeDefined();
      for (const u of air.updrafts ?? []) expect(r!.updrafts, id).toContainEqual({ ...u, art: expect.stringMatching(/^kit-[a-z]+-updraft$/) });
      for (const w of air.winds ?? []) {
        expect(r!.winds, id).toContainEqual({ ...w, art: expect.stringMatching(/^kit-[a-z]+-wind-current$/) });
        expect(windProblems(w, r!.size.w), `${id} ${w.id}`).toEqual([]);
      }
    }
  });

  it('gives every course an updraft and a wind current, and every one of them a way in', () => {
    for (const course of [CANOPY_COURSE, BRUSH_COURSE, CIRCUIT_COURSE]) {
      expect(COURSES[course.id]).toBe(course);
      const rooms = [...course.acts, ...(course.rooms ?? [])].map((id) => ROOMS[id]!);
      expect(rooms.some((r) => (r.updrafts ?? []).length > 0), course.id).toBe(true);
      expect(rooms.some((r) => (r.winds ?? []).length > 0), course.id).toBe(true);
    }
    for (const id of Object.keys(COURSE_AIR)) {
      for (const [node, tier] of Object.entries(airTiers(ROOMS[id]!))) expect(tier, `${id} ${node}`).not.toBeNull();
    }
  });
});

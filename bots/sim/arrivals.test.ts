/**
 * The bots' ways in by a mover (arrivals.ts, OP-287), held to the game's rules: which rooms an owl falls
 * or hops into, what the bot owl does with that, and that every course room's arrivals come down safe.
 */
import { describe, expect, it } from 'vitest';
import { arrivalAir, GROUNDED, JUMP_RISE, type RoomDef } from '@owl-park/shared';
import { COURSES, ROOMS } from '@owl-park/shared/rooms';
import { ARRIVAL_SCATTER, moverWaysIn, playArrival } from './arrivals';
import { botRoom, owlAt, stepOwl, STEPS_PER_S } from './owl';
import { surfaceAt, surfacesOf } from './surfaces';

const courseRooms = Object.values(COURSES)
  .filter((c) => !c.keeper)
  .flatMap((c) => [...c.acts, ...(c.rooms ?? [])]);

describe('the ways into a room by a mover', () => {
  it('an owl falls into the storey below a trunk’s hatch, and hops out of the tunnel up into the storey above', () => {
    // The Updraft Canopy's trunk: 2b's way down drops into 2a, and 2a's way up is a tunnel into 2b.
    expect(moverWaysIn(ROOMS['canopy-2a']!)).toContainEqual({ spawn: 'from-above', came: 'dive' });
    expect(moverWaysIn(ROOMS['canopy-2b']!)).toContainEqual({ spawn: 'from-below', came: 'tunnel' });
    expect(moverWaysIn(ROOMS['canopy-2b']!)).toContainEqual({ spawn: 'from-above', came: 'dive' });
    // The crown is come into by the tunnel up from the trunk and back out of the hut, and by no dive.
    expect(moverWaysIn(ROOMS['canopy-3']!).filter((w) => w.came === 'dive')).toEqual([]);
  });

  it('reads a room with no mover leading to it as having none, and a spawn the room has not as no way in', () => {
    const lone: RoomDef = { ...ROOMS['canopy-2a']!, id: 'lone' };
    expect(moverWaysIn(lone, { lone })).toEqual([]);
    const other: RoomDef = { ...ROOMS['canopy-2b']!, doors: ROOMS['canopy-2b']!.doors.map((d) => (d.id === 'down' ? { ...d, to: { room: 'canopy-2a', spawn: 'nowhere' } } : d)) };
    expect(moverWaysIn(ROOMS['canopy-2a']!, { 'canopy-2a': ROOMS['canopy-2a']!, 'canopy-2b': other })).toEqual([]);
  });

  it('plays the hop out of a tunnel as the game’s flight does: up out of the mouth and back down where it came up, well under a jump', () => {
    const br = botRoom(ROOMS['canopy-2b']!);
    const at = br.room.spawns['from-below']!;
    const o = owlAt(at.x, 0, 100_000);
    o.fl = { ...o.fl, air: arrivalAir('tunnel', 0) };
    let peak = 0;
    for (let i = 0; i < 2 * STEPS_PER_S && (i < 2 || o.fl.air.s !== GROUNDED); i++) {
      stepOwl(br, o, { way: 0, pressed: false, held: false });
      peak = Math.max(peak, o.fl.air.z);
    }
    expect(o.fl.air.s).toBe(GROUNDED);
    expect(peak).toBeGreaterThan(30);
    expect(peak).toBeLessThan(JUMP_RISE / 2);
    expect(surfaceAt(surfacesOf(br), o.x, o.fl.air.z)?.id).toMatch(/^floor/);
  });

  it('a diver that spreads its wings can come down on a ledge its spawn’s floor is only a jump from', () => {
    // The trunk's middle storey: falling in by its west wall, a drop and then a held glide east comes
    // down on the first shelf (u1); pressing nothing comes down on the floor under the spawn.
    const br = botRoom(ROOMS['canopy-2b']!);
    const report = playArrival(br, surfacesOf(br), { spawn: 'from-above', came: 'dive' });
    expect(report.unsafe).toBe(false);
    expect(report.lands).toEqual(['floor0', 'u1']);
  });

  it('the hop out of the tunnel behind the ink course’s waterfall stays under the falling water over its ledge', () => {
    // 60 px of air between the ledge and the water (brush-2's falls-high): a hop as high as half a jump rose into it.
    const br = botRoom(ROOMS['brush-2']!);
    const report = playArrival(br, surfacesOf(br), { spawn: 'from-falls', came: 'tunnel' });
    expect(report.unsafe).toBe(false);
  });

  it.each(courseRooms)('%s: every way in by a mover comes down safe with nothing pressed, on a spawn with room for the room server’s scatter', (id) => {
    const room = ROOMS[id]!;
    const br = botRoom(room);
    const surfaces = surfacesOf(br);
    for (const w of moverWaysIn(room)) {
      const report = playArrival(br, surfaces, w);
      expect(report.unsafe, `${id}@${w.spawn} by a ${w.came}`).toBe(false);
      expect(report.lands.length, `${id}@${w.spawn} by a ${w.came}`).toBeGreaterThan(0);
      // Set down as far off its spawn as the room server may, it still stands on something.
      const at = room.spawns[w.spawn]!;
      const z = room.spawnTops?.[w.spawn] ?? 0;
      for (const dx of [-ARRIVAL_SCATTER, ARRIVAL_SCATTER]) {
        if (at.x + dx < 8 || at.x + dx > room.size.w - 8) continue;
        if (z > 0) continue; // a perch's spawn is set down on its perch, not scattered along the floor
        expect(surfaceAt(surfaces, at.x + dx, 0), `${id}@${w.spawn} ${dx} px off`).not.toBeNull();
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  ARCADE_GAMES,
  ARCADE_ROOM,
  CABINETS,
  CABINET_OFF,
  FLAP_FIRST,
  FLAP_SPACING,
  FLAP_SPEED,
  GAMES,
  HOP_LANES,
  HOP_MS,
  KNOCK_LEVELS,
  KNOCK_MAX_SCORE,
  KNOCK_NEST_POINTS,
  KNOCK_SHOTS,
  KNOCK_SHOT_MS,
  RUN_MAX_MS,
  cabinetAt,
  cabinetOf,
  isArcadeGame,
  leastRunMs,
  plausibleRun,
  portraitLook,
  runFeathers,
} from './arcade';
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

describe('the arcade’s games', () => {
  it('names each game, and knows them by id only', () => {
    expect(ARCADE_GAMES.map((g) => GAMES[g].name)).toEqual(['Hoot & Hop', 'Moon Flap', 'Talon Toss']);
    expect(ARCADE_GAMES.every((g) => cabinetOf(g).game === g)).toBe(true);
    expect(isArcadeGame('flight')).toBe(true);
    expect(isArcadeGame('Moon Flap')).toBe(false);
    expect(isArcadeGame(undefined)).toBe(false);
  });

  it('pays 0 to 6 feathers a run, one more for each band its score reaches', () => {
    for (const g of ARCADE_GAMES) {
      const bands = GAMES[g].bands;
      expect([...bands]).toEqual([...bands].sort((a, b) => a - b));
      expect(runFeathers(g, 0)).toBe(0);
      expect(runFeathers(g, bands[0] - 1)).toBe(0);
      bands.forEach((b, i) => expect(runFeathers(g, b)).toBe(i + 1));
      expect(runFeathers(g, 10_000)).toBe(6);
    }
  });

  it('plays Talon Toss at three targets, five shots each, with the nest worth eight and thirty the best (OP-137)', () => {
    expect([KNOCK_LEVELS, KNOCK_SHOTS, KNOCK_NEST_POINTS]).toEqual([3, 5, 8]);
    expect(GAMES.sling.maxScore).toBe(KNOCK_MAX_SCORE);
    expect(KNOCK_MAX_SCORE).toBe(30);
    expect(GAMES.sling.bands[5]).toBeLessThanOrEqual(GAMES.sling.maxScore!);
  });

  it('knows the least time a result can take', () => {
    // Hoot & Hop: a hop a point, and the perch's hop two (seven points a level of six hops).
    expect(leastRunMs({ game: 'crossing', score: 3 })).toBe(3 * HOP_MS);
    expect(leastRunMs({ game: 'crossing', score: HOP_LANES + 2 })).toBe((HOP_LANES + 1) * HOP_MS);
    expect(leastRunMs({ game: 'crossing', score: 2 * (HOP_LANES + 2) + 2 })).toBe((2 * (HOP_LANES + 1) + 2) * HOP_MS);
    expect(leastRunMs({ game: 'flight', score: 0 })).toBe(0);
    expect(leastRunMs({ game: 'flight', score: 1 })).toBe((FLAP_FIRST / FLAP_SPEED) * 1000);
    expect(leastRunMs({ game: 'flight', score: 11 })).toBe(((FLAP_FIRST + 10 * FLAP_SPACING) / FLAP_SPEED) * 1000);
    expect(leastRunMs({ game: 'sling', score: 9, shots: 5 })).toBe(5 * KNOCK_SHOT_MS);
  });

  it('takes a result only when the run lasted long enough for it', () => {
    const hop = { game: 'crossing', score: 21 } as const;
    expect(plausibleRun(hop, leastRunMs(hop))).toBe(true);
    expect(plausibleRun(hop, leastRunMs(hop) - 900)).toBe(true);
    expect(plausibleRun(hop, leastRunMs(hop) - 1100)).toBe(false);
    const flap = { game: 'flight', score: 12 } as const;
    expect(plausibleRun(flap, leastRunMs(flap) - 500)).toBe(true);
    expect(plausibleRun(flap, 5_000)).toBe(false);
    expect(plausibleRun({ game: 'flight', score: 0 }, 0)).toBe(true);
    // Too long: a run left open is forgotten.
    expect(plausibleRun({ game: 'flight', score: 0 }, RUN_MAX_MS + 1)).toBe(false);
  });

  it('refuses a result that cannot be', () => {
    expect(plausibleRun({ game: 'crossing', score: -1 }, 60_000)).toBe(false);
    expect(plausibleRun({ game: 'crossing', score: 2.5 }, 60_000)).toBe(false);
    // Talon Toss: the shots come with the points, fifteen at most, nothing down before the first, thirty a run.
    expect(plausibleRun({ game: 'sling', score: 9 }, 60_000)).toBe(false);
    expect(plausibleRun({ game: 'sling', score: 14, shots: 1 }, 60_000)).toBe(true);
    expect(plausibleRun({ game: 'sling', score: 1, shots: 0 }, 60_000)).toBe(false);
    expect(plausibleRun({ game: 'sling', score: 0, shots: 0 }, 0)).toBe(true);
    expect(plausibleRun({ game: 'sling', score: 31, shots: 15 }, 600_000)).toBe(false);
    expect(plausibleRun({ game: 'sling', score: 30, shots: 15 }, 600_000)).toBe(true);
    expect(plausibleRun({ game: 'sling', score: 0, shots: KNOCK_LEVELS * KNOCK_SHOTS + 1 }, 600_000)).toBe(false);
    expect(plausibleRun({ game: 'sling', score: 3, shots: 1 }, 300)).toBe(true);
    expect(plausibleRun({ game: 'sling', score: 6, shots: 4 }, 2_000)).toBe(false);
  });

  it('puts only colours and kind on the wall', () => {
    const look = { body: '#112233', belly: '#445566', accent: '#778899', species: 'barn' as const, wear: { head: 'crown~0' }, pledge: 'x' };
    expect(portraitLook(look)).toEqual({ body: '#112233', belly: '#445566', accent: '#778899', species: 'barn' });
    expect(portraitLook({ body: '#112233', belly: '#445566', accent: '#778899' })).toEqual({ body: '#112233', belly: '#445566', accent: '#778899' });
  });
});


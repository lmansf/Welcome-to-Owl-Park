import { describe, expect, it } from 'vitest';
import { ROOMS } from '../rooms';
import { parseClientFrame, parseServerFrame } from './edge';
import { SNOWBALL_EVERY_MS, SNOW_FROM, snowSeason, snowTints, snowsIn } from './snow';
import { isParkMessage } from './validate';

describe('when the first snow starts (Logan, Nov 24: "Snow on Dec 1")', () => {
  it('starts for everyone at midnight Eastern on Dec 1, and not a minute before', () => {
    expect(SNOW_FROM).toBe('2026-12-01');
    // 23:59 Eastern on Nov 30 is 04:59 UTC on Dec 1.
    expect(snowSeason(Date.UTC(2026, 11, 1, 4, 59))).toBe(false);
    expect(snowSeason(Date.UTC(2026, 11, 1, 5, 0))).toBe(true);
    expect(snowSeason(Date.UTC(2026, 10, 24, 18, 0))).toBe(false);
    expect(snowSeason(Date.UTC(2026, 11, 25, 12, 0))).toBe(true);
  });
});

describe('where the first snow falls (OP-074, D6)', () => {
  it('falls outdoors: the lobby, the hub at the tree’s foot, the realms and their courses', () => {
    for (const id of ['lobby', 'hub', 'grove', 'market', 'glass', 'ink']) expect(snowsIn(ROOMS[id]!), id).toBe(true);
    const courses = Object.values(ROOMS).filter((r) => /^(canopy|circuit|brush)-\d/.test(r.id) && r.weather !== 'rain');
    expect(courses.length).toBeGreaterThan(0);
    for (const r of courses) expect(snowsIn(r), r.id).toBe(true);
  });

  it('never falls inside: a nest, the arcade hall, the Great Hollow inside the tree', () => {
    expect(snowsIn(ROOMS['arcade']!)).toBe(false);
    expect(snowsIn(ROOMS['m3-hall']!)).toBe(false);
    expect(snowsIn({ id: 'nest-ab12cd34', mood: 'dusk' })).toBe(false);
  });

  it('leaves a room its own rain', () => {
    expect(snowsIn({ id: 'brush-2', mood: 'dusk', weather: 'rain' })).toBe(false);
  });

  it('is white, and in the neon street takes on its lights', () => {
    for (const c of snowTints('dusk')) expect(c >> 16).toBeGreaterThan(0xe0);
    expect(snowTints('neon').length).toBe(3);
    expect(snowTints('neon')).not.toEqual(snowTints('dusk'));
  });

  it('carries a snowball each way: who threw it and at whom, and nothing else (OP-074)', () => {
    expect(SNOWBALL_EVERY_MS).toBe(2000);
    expect(parseClientFrame(JSON.stringify({ t: 'snowball', at: 'v_b' }))).toEqual({ t: 'snowball', at: 'v_b' });
    expect(parseClientFrame(JSON.stringify({ t: 'snowball' }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'snowball', at: 42 }))).toBeNull();
    expect(parseServerFrame(JSON.stringify({ t: 'snowball', id: 'v_a', at: 'v_b' }))).toEqual({ t: 'snowball', id: 'v_a', at: 'v_b' });
    expect(isParkMessage({ t: 'snowball', id: 'a', at: 'b' })).toBe(true);
    expect(isParkMessage({ t: 'snowball', id: 'a', at: 'a' })).toBe(false);
    expect(isParkMessage({ t: 'snowball', id: 'a' })).toBe(false);
  });
});

/**
 * The park clock: one day and one week for every visitor, so the shop, the daily quests and the
 * weekly quests turn over at the same moment for everyone (midnight Eastern; weeks start Monday).
 */

/** The park's own time zone. Every daily and weekly reset happens at local midnight here. */
export const PARK_TIME_ZONE = 'America/New_York';

const DAY_MS = 24 * 60 * 60 * 1000;
const QUARTER_HOUR = 15 * 60 * 1000;

let fmt: Intl.DateTimeFormat | null = null;
function parts(at: number): { y: number; m: number; d: number } {
  fmt ??= new Intl.DateTimeFormat('en-US', { timeZone: PARK_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
  const p = fmt.formatToParts(new Date(at));
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day') };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The park day at a moment: `YYYY-MM-DD` in the park's time zone. */
export function parkDay(at: number): string {
  const p = parts(at);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** The park week at a moment: `W` and the date of its Monday, e.g. `W2026-10-19`. */
export function parkWeek(at: number): string {
  const p = parts(at);
  // Day of week from the calendar date alone (UTC arithmetic on the date, not on the moment).
  const date = Date.UTC(p.y, p.m - 1, p.d);
  const dow = (new Date(date).getUTCDay() + 6) % 7; // Monday 0 ... Sunday 6
  const monday = new Date(date - dow * DAY_MS);
  return `W${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

/** The first instant after `at` whose key differs: the next park midnight (or Monday midnight). */
function nextChange(at: number, key: (t: number) => string, maxHours: number): number {
  const k = key(at);
  let lo = at;
  let hi = Math.floor(at / QUARTER_HOUR) * QUARTER_HOUR + QUARTER_HOUR;
  for (let i = 0; i < maxHours * 4 && key(hi) === k; i++) {
    lo = hi;
    hi += QUARTER_HOUR;
  }
  if (key(hi) === k) return hi;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (key(mid) === k) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** When the next park day starts (ms). */
export function nextParkDayAt(at: number): number {
  return nextChange(at, parkDay, 26);
}

/** When the next park week starts (ms). */
export function nextParkWeekAt(at: number): number {
  const week = parkWeek(at);
  let t = nextParkDayAt(at);
  for (let i = 0; i < 7 && parkWeek(t) === week; i++) t = nextParkDayAt(t);
  return t;
}

/** Whole days from park day `a` to park day `b` (both `YYYY-MM-DD`), negative when `b` is earlier. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

// ---------- the park moon (the stained-glass climb, designs/the-stained-glass-climb.md) ----------

/** A new moon; the preview's opening, fourteen days later, is a full moon. */
export const MOON_EPOCH_DAY = '2026-11-17';
export const MOON_CYCLE_DAYS = 28;
export const MOON_PHASE_DAYS = 3.5;
export type MoonTier = 'easy' | 'medium' | 'hard';

/** The moon's phase on a park day: 0 new, 4 full, 7 the last crescent. A synthetic cycle, the same for everyone. */
export function parkMoon(day: string): number {
  const d = daysBetween(MOON_EPOCH_DAY, day);
  return Math.floor((((d % MOON_CYCLE_DAYS) + MOON_CYCLE_DAYS) % MOON_CYCLE_DAYS) / MOON_PHASE_DAYS);
}

/** How hard the climb is under a phase: rising to the full moon and falling back. */
export function moonTier(phase: number): MoonTier {
  if (phase === 4) return 'hard';
  if (phase === 0 || phase === 1 || phase === 7) return 'easy';
  return 'medium';
}

/** Tonight's night key: the keepers' special night when it is one of `known`, else the moon's tier. */
export function nightFor(day: string, special: string | null | undefined, known: (key: string) => boolean): string {
  if (special && known(special)) return special;
  return moonTier(parkMoon(day));
}

/** A small stable hash of a string to a 32-bit seed (FNV-1a), for public rotations. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A seedable generator (mulberry32) for rotations everyone must agree on. */
export function rotationRandom(seedText: string): () => number {
  let a = hashSeed(seedText);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

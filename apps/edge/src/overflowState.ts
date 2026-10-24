/**
 * The Worker's view of the overflow object (OP-075): read at most every few seconds and kept, so a
 * busy night's arrivals and the line's polls cost the object one request per Worker every few
 * seconds, not one each, and a quiet night one every half minute. When the object cannot be reached
 * the last answer stands, and before any there is no line: a fault here never keeps owls out.
 */
import { LINE_DEFAULTS, RIBBON_DEFAULTS } from '@owl-park/shared';
import type { OverflowState } from './Overflow';

/** How long a Worker keeps what it read while anything is on: a keeper's change reaches every visitor within this. */
export const OVERFLOW_KEEP_MS = 3_000;
/** With nothing on (no line, no ribbon, no copies), as on most nights, a Worker looks again only this often. */
export const OVERFLOW_QUIET_KEEP_MS = 30_000;

const quiet = (s: OverflowState) => !s.active && s.line.mode === 'off' && !s.ribbon.on && Object.keys(s.copies).length === 0;

/** No line, no ribbon, no copies: the park as deployed. */
export const QUIET: OverflowState = { line: LINE_DEFAULTS, active: false, waiting: 0, lastCalled: 0, rate: 0, ribbon: RIBBON_DEFAULTS, notice: null, copies: {}, count: null, countedAt: null };

let kept: { state: OverflowState; until: number } | null = null;

export async function overflowNow(read: () => Promise<OverflowState>, now = Date.now()): Promise<OverflowState> {
  if (kept && now < kept.until) return kept.state;
  try {
    const state = await read();
    kept = { state, until: now + (quiet(state) ? OVERFLOW_QUIET_KEEP_MS : OVERFLOW_KEEP_MS) };
    return state;
  } catch (e) {
    console.error('[owl-park] the overflow object could not be read:', e instanceof Error ? e.message : e);
    const state = kept?.state ?? QUIET;
    kept = { state, until: now + OVERFLOW_KEEP_MS };
    return state;
  }
}

/** Forget what was read (after a keeper's change through this Worker, and in tests). */
export function forgetOverflow(): void {
  kept = null;
}

/** Owls in one room object, as last asked (kept for a moment): what routing to a room's copies weighs. */
const counted = new Map<string, { n: number; until: number }>();
export const COPY_COUNT_KEEP_MS = 2_000;

export async function countIn(name: string, read: () => Promise<Record<string, number>>, now = Date.now()): Promise<number> {
  const k = counted.get(name);
  if (k && now < k.until) return k.n;
  let n = k?.n ?? 0;
  try {
    n = Object.values(await read()).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  } catch {
    /* the last count stands */
  }
  counted.set(name, { n, until: now + COPY_COUNT_KEEP_MS });
  return n;
}

/** A newcomer was just sent to this room object: count it there at once, so the next one weighs it too. */
export function countedOneMore(name: string): void {
  const k = counted.get(name);
  if (k) k.n += 1;
}

export function forgetCounts(): void {
  counted.clear();
}

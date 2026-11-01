/**
 * Busy nights (OP-075): the line in front of the park, the busy ribbon, and copies of a room. The
 * keepers change all three with the admin key and no deploy (the capacity page, /admin/capacity);
 * the room server keeps them in its overflow object. Shared so the pages, the Worker and the tests
 * agree on the settings, their limits and what a visitor in the line is told.
 */
import { hashForLog } from './log';
import { mapOf, type RoomDef } from './room';

/**
 * off: never a line. auto: a line once the park holds `threshold` owls, kept until it has emptied.
 * on: every new arrival goes through the line, which lets owls in while the park holds fewer than
 * `threshold`.
 */
export type LineMode = 'off' | 'auto' | 'on';
export const LINE_MODES: readonly LineMode[] = ['off', 'auto', 'on'];

export interface LineSettings {
  mode: LineMode;
  /** Owls in the park at once before new arrivals wait (auto), and the most the line lets in. */
  threshold: number;
  /** Minutes a called owl's place is kept for it. */
  holdMin: number;
}

/**
 * Off until the keepers turn it on. 80: one room object holds about 80 owls walking at once
 * (OP-068's load test), and the deployed park keeps every room in one object.
 */
export const LINE_DEFAULTS: LineSettings = { mode: 'off', threshold: 80, holdMin: 3 };
export const THRESHOLD_MAX = 5000;
export const HOLD_MIN_MAX = 15;

export interface RibbonSettings {
  on: boolean;
  /** The keepers' own words; null shows RIBBON_WORDS. */
  words: string | null;
}

export const RIBBON_DEFAULTS: RibbonSettings = { on: false, words: null };
/** The ribbon's words unless the keepers write their own (for the owner's approval). */
export const RIBBON_WORDS = "It's busy tonight; things may be slow";
export const RIBBON_MAX_CHARS = 90;

/** A copy of a room beside the room itself (copy 1): taking new owls, or draining (no new owls, then closed). */
export type CopyState = 'open' | 'draining';
/** Room id -> copy number ("2" to COPY_MAX) -> its state. A room with no entry is just itself. */
export type Copies = Record<string, Record<string, CopyState>>;
export const COPY_MAX = 9;

/** The line's settings with the given changes, or null when a change is out of bounds. */
export function withLineChanges(base: LineSettings, v: unknown): LineSettings | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out = { ...base };
  if (o['mode'] !== undefined) {
    if (!LINE_MODES.includes(o['mode'] as LineMode)) return null;
    out.mode = o['mode'] as LineMode;
  }
  if (o['threshold'] !== undefined) {
    const t = o['threshold'];
    if (typeof t !== 'number' || !Number.isInteger(t) || t < 0 || t > THRESHOLD_MAX) return null;
    out.threshold = t;
  }
  if (o['holdMin'] !== undefined) {
    const h = o['holdMin'];
    if (typeof h !== 'number' || !Number.isInteger(h) || h < 1 || h > HOLD_MIN_MAX) return null;
    out.holdMin = h;
  }
  return out;
}

/** The ribbon's settings with the given changes (words trimmed; empty means the ribbon's own), or null when out of bounds. */
export function withRibbonChanges(base: RibbonSettings, v: unknown): RibbonSettings | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out = { ...base };
  if (o['on'] !== undefined) {
    if (typeof o['on'] !== 'boolean') return null;
    out.on = o['on'];
  }
  if (o['words'] !== undefined) {
    const w = o['words'];
    if (w === null) out.words = null;
    else {
      if (typeof w !== 'string') return null;
      // One line of plain words: no line breaks or control characters.
      const t = w.replace(/\s+/g, ' ').trim();
      if (t.length > RIBBON_MAX_CHARS || /[\u0000-\u001f\u007f]/.test(t)) return null;
      out.words = t || null;
    }
  }
  return out;
}

/** What the ribbon says now: its words while it is on, and while the line is (it comes on by itself); null when off. */
export function ribbonNow(r: RibbonSettings, lineActive: boolean): string | null {
  return r.on || lineActive ? (r.words ?? RIBBON_WORDS) : null;
}

/**
 * What a visitor asking about the line is told. `go`: there is no line for it (none on, or it was
 * in the park lately), so in it goes; `waiting`: its place, and a rough wait in minutes (null
 * while the line has not moved yet); `called`: its turn, the place held until `holdUntil`, and the
 * entry its socket shows; `expired`: its turn passed while it was away, so it joins again.
 */
export type LineStatus =
  | { state: 'go'; entry?: string }
  | { state: 'waiting'; n: number; place: number; waitMin: number | null }
  | { state: 'called'; n: number; holdUntil: number; entry: string }
  | { state: 'expired' };

/** Owls called per minute over the last ten minutes, from the times they were called. */
export function lineRate(calledAt: readonly number[], now: number): number {
  const recent = calledAt.filter((t) => now - t <= 10 * 60_000 && t <= now).length;
  return recent / 10;
}

/** A rough wait in whole minutes for this place, at this rate; null while the line has not moved. */
export function waitMinutes(place: number, perMinute: number): number | null {
  if (!(perMinute > 0)) return null;
  return Math.max(1, Math.ceil(place / perMinute));
}

// ---------- the realms switch (the stained-glass climb, designs/the-stained-glass-climb.md) ----------

/**
 * Which gated rooms are open, whether the climb's portal is live, and the keepers' special night
 * (null: the moon decides). A room without `gated` on its RoomDef never consults this.
 */
export interface RealmsSettings {
  open: string[];
  portal: boolean;
  night: string | null;
  /**
   * The entries setting (OP-156): of every hundred new arrivals, how many start in the tree (map 2)
   * rather than today's park; absent is 0. Above 0 the tree's gated rooms are open to every owl the
   * front gate lets in; at 0 the tree is dark, and only a keeper's token reaches it.
   */
  tree?: number;
}
export const REALMS_DEFAULTS: RealmsSettings = { open: [], portal: false, night: null };
export const REALMS_OPEN_MAX = 16;

/** The tree's share of new arrivals, 0 to 100 (the entries setting, OP-156). */
export function treeShare(r: Pick<RealmsSettings, 'tree'>): number {
  const n = r.tree;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? Math.min(100, n) : 0;
}

/** These settings with the tree's share set: kept only when above 0, so a switch never touched reads as before. */
function withTree(r: RealmsSettings, share: number): RealmsSettings {
  const { tree: _gone, ...rest } = r;
  return share > 0 ? { ...rest, tree: share } : rest;
}

/**
 * Which park a new arrival starts in (OP-156): the tree for about `share` owls in every hundred, the
 * same answer for an owl every time (its id decides), today's park for the rest and whenever the share
 * is 0.
 */
export function entryMap(who: string, share: number): 1 | 2 {
  if (!(share > 0)) return 1;
  if (share >= 100) return 2;
  return parseInt(hashForLog(`entry:${who}`).slice(-6), 16) % 100 < share ? 2 : 1;
}

/**
 * Whether the realms switch keeps a room shut: a gated room not in `open`; a gated room of the tree
 * (map 2) is also open while the tree takes a share of the arrivals. Rooms without `gated` are never shut.
 */
export function realmShut(room: Pick<RoomDef, 'id' | 'gated' | 'map'> | undefined, r: RealmsSettings): boolean {
  if (!room || room.gated !== true || r.open.includes(room.id)) return false;
  return !(mapOf(room) === 2 && treeShare(r) > 0);
}

/** The realms settings with the given changes, or null when a room is not gated or a night is unknown. */
export function withRealmsChanges(base: RealmsSettings, v: unknown, gated: (room: string) => boolean, night: (key: string) => boolean): RealmsSettings | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  let out: RealmsSettings = withTree({ open: [...base.open], portal: base.portal, night: base.night }, treeShare(base));
  if (o['open'] !== undefined) {
    const list = o['open'];
    if (!Array.isArray(list) || list.length > REALMS_OPEN_MAX || !list.every((r) => typeof r === 'string' && gated(r))) return null;
    out.open = [...new Set(list as string[])].sort();
  }
  if (o['portal'] !== undefined) {
    if (typeof o['portal'] !== 'boolean') return null;
    out.portal = o['portal'];
  }
  if (o['night'] !== undefined) {
    const n = o['night'];
    if (n !== null && (typeof n !== 'string' || !night(n))) return null;
    out.night = n;
  }
  if (o['tree'] !== undefined) {
    const share = o['tree'];
    if (typeof share !== 'number' || !Number.isInteger(share) || share < 0 || share > 100) return null;
    out = withTree(out, share);
  }
  return out;
}

/** A realms value as it arrived (a notice, a stored copy): its shape kept, anything else the defaults. */
export function cleanRealms(v: unknown): RealmsSettings {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return REALMS_DEFAULTS;
  const o = v as Record<string, unknown>;
  const open = Array.isArray(o['open']) ? (o['open'] as unknown[]).filter((r): r is string => typeof r === 'string' && r.length <= 32).slice(0, REALMS_OPEN_MAX).sort() : [];
  const clean: RealmsSettings = { open, portal: o['portal'] === true, night: typeof o['night'] === 'string' && o['night'].length <= 32 ? o['night'] : null };
  return withTree(clean, typeof o['tree'] === 'number' && Number.isInteger(o['tree']) && o['tree'] >= 0 && o['tree'] <= 100 ? o['tree'] : 0);
}

export const sameRealms = (a: RealmsSettings, b: RealmsSettings): boolean =>
  a.portal === b.portal && a.night === b.night && treeShare(a) === treeShare(b) && a.open.length === b.open.length && a.open.every((r, i) => r === b.open[i]);

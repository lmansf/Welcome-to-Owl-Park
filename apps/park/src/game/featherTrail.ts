import { distance, type DoorDef, type Vec2 } from '@owl-park/shared';

/**
 * The feather trail (OP-307): a faint line of drifting feathers from where the owl stands toward the
 * nearest doorway it has not been through yet, and a small glint on every such doorway. A guest who
 * follows the feathers finds every place without a map; once every doorway of a room has been tried
 * the room shows neither. The doorways tried are kept on this device (localStorage), like the map's
 * lit places. Settings has a switch for it (on by default).
 */

/** This device's doorways tried, as `room#door`. */
export const DOORS_TRIED_KEY = 'owl-park:doors-tried';
/** At most this many doorways are kept: the oldest go first (a park has a few hundred). */
export const DOORS_TRIED_MAX = 800;

/** A doorway's key among those tried. */
export function doorKey(room: string, door: string): string {
  return `${room}#${door}`;
}

/** The doorways tried, from what storage holds: strings only, anything else dropped. */
export function parseTried(raw: string | null): string[] {
  let v: unknown = null;
  try {
    v = raw ? JSON.parse(raw) : null;
  } catch {
    v = null;
  }
  return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string').slice(-DOORS_TRIED_MAX) : [];
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** The doorways this device has been through, kept as the owl goes through each. */
export class TriedDoors {
  private readonly keys: string[];
  private readonly set: Set<string>;

  constructor(private readonly storage: Store | null) {
    let raw: string | null = null;
    try {
      raw = storage?.getItem(DOORS_TRIED_KEY) ?? null;
    } catch {
      raw = null;
    }
    this.keys = parseTried(raw);
    this.set = new Set(this.keys);
  }

  has(room: string, door: string): boolean {
    return this.set.has(doorKey(room, door));
  }

  /** The owl went through a doorway (or came in by it): true when that is news. */
  add(room: string, door: string): boolean {
    const k = doorKey(room, door);
    if (this.set.has(k)) return false;
    this.set.add(k);
    this.keys.push(k);
    while (this.keys.length > DOORS_TRIED_MAX) this.set.delete(this.keys.shift()!);
    try {
      this.storage?.setItem(DOORS_TRIED_KEY, JSON.stringify(this.keys));
    } catch {
      /* private mode: kept for this visit only */
    }
    return true;
  }
}

/** Where a doorway's trail ends and its glint shines: its sign's spot, else the middle of its floor. */
export function doorSpot(door: Pick<DoorDef, 'rect' | 'marker' | 'markAt'>): Vec2 {
  return door.marker ?? door.markAt ?? { x: door.rect.x + door.rect.w / 2, y: door.rect.y + door.rect.h / 2 };
}

/** The doorway nearest `from` among `doors`, or null for none. */
export function nearestDoor<D extends Pick<DoorDef, 'rect' | 'marker' | 'markAt'>>(from: Vec2, doors: readonly D[]): D | null {
  let best: D | null = null;
  let bestAt = Infinity;
  for (const d of doors) {
    const at = distance(from, doorSpot(d));
    if (at < bestAt) {
      best = d;
      bestAt = at;
    }
  }
  return best;
}

/** How a trail is laid: a feather every `gap` px along the way, none nearer the owl than `start` or the doorway than `end`, at most `most`. */
export const TRAIL = { gap: 110, start: 80, end: 60, most: 10 } as const;

/** The feathers' spots along a way (the owl, then each bend, then the doorway). */
export function trailPoints(way: readonly Vec2[], t: { gap: number; start: number; end: number; most: number } = TRAIL): Vec2[] {
  let total = 0;
  for (let i = 1; i < way.length; i++) total += distance(way[i - 1]!, way[i]!);
  const out: Vec2[] = [];
  for (let at = t.start; at <= total - t.end && out.length < t.most; at += t.gap) {
    let left = at;
    for (let i = 1; i < way.length; i++) {
      const a = way[i - 1]!;
      const b = way[i]!;
      const len = distance(a, b);
      if (left <= len) {
        const k = len === 0 ? 0 : left / len;
        out.push({ x: Math.round(a.x + (b.x - a.x) * k), y: Math.round(a.y + (b.y - a.y) * k) });
        break;
      }
      left -= len;
    }
  }
  return out;
}

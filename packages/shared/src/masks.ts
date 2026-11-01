/**
 * The ledge painter's draft (OP-156, part 2): what a keeper paints over a room of the tree (map 2),
 * in room pixels, before any of it becomes room data. A ledge is a perch as the tree's rooms make
 * them (a span from x0 to x1 on the plan, `top` above the ground line); a wall stands at x from y0
 * down to y1 (room y, down the screen); a hazard is a span like a ledge's; a front is a polygon over
 * the playfield to be drawn in front of the owls (a post, a pillar, the near side of a railing).
 *
 * A keeper saves a draft through the Worker (POST /api/admin/masks/<room>), which keeps one per room
 * in the overflow object; anyone may read it back (GET /api/masks/<room>: level geometry, nothing
 * personal), and `pnpm masks:pull <room>` prints it as room data to paste in. The game does not read
 * a draft: a ledge or a front is the park's once it is in packages/shared/rooms.
 *
 * checkMasks is the one check of a draft, the Worker's, the overflow object's and the painter's: all
 * four lists and nothing else, each at most MASK_LIST_MAX items; ids unique across the draft and
 * words of [a-z0-9-]; numbers finite and inside the room; x0 < x1, y0 < y1, 0 < top <= MAX_PERCH_TOP;
 * a front of 3 to 64 points. Anything else, an extra field included, is refused, and the refusal says
 * why in a fixed word and where (the list and the item's place in it), never what was sent.
 *
 * Module by module and with no class of its own, so the pull script's Node reads it (type stripping).
 */
import { MAX_PERCH_TOP } from './perches';
import type { Vec2 } from './protocol';
import { mapOf, type RoomDef } from './room';

/** A ledge: a perch over the ground line from x0 to x1, `top` above it (room px). */
export interface LedgeMark {
  id: string;
  x0: number;
  x1: number;
  top: number;
}

/** A wall: an upright line at x, from y0 down to y1 (room y). */
export interface WallMark {
  id: string;
  x: number;
  y0: number;
  y1: number;
}

/** A hazard: a span from x0 to x1, `top` above the ground line, as a ledge is. */
export interface HazardMark {
  id: string;
  x0: number;
  x1: number;
  top: number;
}

/** A region of the playfield to be drawn in front of the owls: a polygon, in room px. */
export interface FrontMark {
  id: string;
  points: Vec2[];
}

export interface MaskDraft {
  ledges: LedgeMark[];
  walls: WallMark[];
  hazards: HazardMark[];
  fronts: FrontMark[];
}

/** A draft as the overflow object keeps it and GET /api/masks/<room> answers it. */
export interface SavedMasks extends MaskDraft {
  room: string;
  /** When it was saved (ms since 1970). */
  savedAt: number;
}

export const MASK_LISTS = ['ledges', 'walls', 'hazards', 'fronts'] as const;
export type MaskList = (typeof MASK_LISTS)[number];

/** The most items one list of a draft may hold. */
export const MASK_LIST_MAX = 200;
/** The fewest and the most points a front may have. */
export const FRONT_POINTS_MIN = 3;
export const FRONT_POINTS_MAX = 64;
/** An item's id: what the painter makes (`ledge-7`) or a room's own (`stair-1`). */
export const MASK_ID = /^[a-z0-9-]{1,32}$/;

/** Why a draft was refused, a word for each rule. */
export const MASK_REASONS = ['body', 'list', 'too-many', 'item', 'id', 'same-id', 'number', 'outside', 'order', 'top', 'points'] as const;
export type MaskReason = (typeof MASK_REASONS)[number];

export interface MaskRefusal {
  reason: MaskReason;
  /** The list the refused item is in, and its place there (from 0). */
  list?: MaskList;
  index?: number;
}

export type MaskCheck = { ok: true; draft: MaskDraft } | ({ ok: false } & MaskRefusal);

/** The fields an item of each list has, exactly. */
const FIELDS: Record<MaskList, readonly string[]> = {
  ledges: ['id', 'x0', 'x1', 'top'],
  walls: ['id', 'x', 'y0', 'y1'],
  hazards: ['id', 'x0', 'x1', 'top'],
  fronts: ['id', 'points'],
};

type Size = { w: number; h: number };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** These fields and no others. */
const exactly = (v: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Whether the painter works over this room: one of the tree's (map 2). */
export function isPaintable(room: Pick<RoomDef, 'map'> | null | undefined): boolean {
  return !!room && mapOf(room) === 2;
}

/** An empty draft. */
export function emptyMasks(): MaskDraft {
  return { ledges: [], walls: [], hazards: [], fronts: [] };
}

/** A span from x0 to x1 at `top` (a ledge's or a hazard's), or why not. */
function span(item: Record<string, unknown>, size: Size): { x0: number; x1: number; top: number } | MaskReason {
  const { x0, x1, top } = item;
  if (!finite(x0) || !finite(x1) || !finite(top)) return 'number';
  if (x0 < 0 || x1 > size.w) return 'outside';
  if (x0 >= x1) return 'order';
  if (!(top > 0 && top <= MAX_PERCH_TOP)) return 'top';
  return { x0, x1, top };
}

function wall(item: Record<string, unknown>, size: Size): { x: number; y0: number; y1: number } | MaskReason {
  const { x, y0, y1 } = item;
  if (!finite(x) || !finite(y0) || !finite(y1)) return 'number';
  if (x < 0 || x > size.w || y0 < 0 || y1 > size.h) return 'outside';
  if (y0 >= y1) return 'order';
  return { x, y0, y1 };
}

function front(item: Record<string, unknown>, size: Size): { points: Vec2[] } | MaskReason {
  const { points } = item;
  if (!Array.isArray(points) || points.length < FRONT_POINTS_MIN || points.length > FRONT_POINTS_MAX) return 'points';
  const out: Vec2[] = [];
  for (const p of points) {
    if (!isRecord(p) || !exactly(p, ['x', 'y'])) return 'points';
    const { x, y } = p;
    if (!finite(x) || !finite(y)) return 'number';
    if (x < 0 || x > size.w || y < 0 || y > size.h) return 'outside';
    out.push({ x, y });
  }
  return { points: out };
}

/**
 * The draft in `body` for a room of this size, every item copied with only its own fields; or why it
 * is refused (the first rule it breaks, list by list and item by item).
 */
export function checkMasks(body: unknown, size: Size): MaskCheck {
  if (!isRecord(body) || !exactly(body, MASK_LISTS)) return { ok: false, reason: 'body' };
  const draft = emptyMasks();
  const seen = new Set<string>();
  for (const list of MASK_LISTS) {
    const items = body[list];
    if (!Array.isArray(items)) return { ok: false, reason: 'list', list };
    if (items.length > MASK_LIST_MAX) return { ok: false, reason: 'too-many', list };
    for (let index = 0; index < items.length; index++) {
      const item: unknown = items[index];
      const refuse = (reason: MaskReason): MaskCheck => ({ ok: false, reason, list, index });
      if (!isRecord(item) || !exactly(item, FIELDS[list])) return refuse('item');
      const id = item['id'];
      if (typeof id !== 'string' || !MASK_ID.test(id)) return refuse('id');
      if (seen.has(id)) return refuse('same-id');
      seen.add(id);
      if (list === 'walls') {
        const w = wall(item, size);
        if (typeof w === 'string') return refuse(w);
        draft.walls.push({ id, ...w });
      } else if (list === 'fronts') {
        const f = front(item, size);
        if (typeof f === 'string') return refuse(f);
        draft.fronts.push({ id, ...f });
      } else {
        const s = span(item, size);
        if (typeof s === 'string') return refuse(s);
        draft[list].push({ id, ...s });
      }
    }
  }
  return { ok: true, draft };
}

/** A room's own ledges as the painter starts from them: each perch's span on the plan and its top. */
export function ledgesOf(room: Pick<RoomDef, 'perches'>): LedgeMark[] {
  return (room.perches ?? []).map((p) => {
    const xs = p.area.map((v) => v.x);
    return { id: p.id, x0: Math.min(...xs), x1: Math.max(...xs), top: p.top };
  });
}

/** A room's own fronts as the painter starts from them (OP-173): each one's polygon, point by point. */
export function frontsOf(room: Pick<RoomDef, 'fronts'>): FrontMark[] {
  return (room.fronts ?? []).map((f) => ({ id: f.id, points: f.poly.map((p) => ({ x: p.x, y: p.y })) }));
}

/**
 * The ledge painter's editing (OP-156): the draft, the tool, what is picked, the front being drawn
 * point by point, and a few steps of undo. Nothing here draws or hears a pointer: the painter
 * (game/ledgePainter.ts) turns presses and drags into these calls, all in room pixels, so the rules
 * are tested by themselves. Every number the editor makes is a whole room pixel, inside the room;
 * a ledge's or a hazard's top stays over the ground line and within MAX_PERCH_TOP.
 */
import {
  FRONT_POINTS_MAX,
  FRONT_POINTS_MIN,
  MASK_LISTS,
  MAX_PERCH_TOP,
  closestPointOnSegment,
  distance,
  pointInPolygon,
  type FrontMark,
  type HazardMark,
  type LedgeMark,
  type MaskDraft,
  type MaskList,
  type Perch,
  type Polygon,
  type Vec2,
  type WallMark,
} from '@owl-park/shared';

export type MarkKind = 'ledge' | 'wall' | 'hazard' | 'front';
export type Tool = 'select' | MarkKind;
export const TOOLS: readonly Tool[] = ['select', 'ledge', 'wall', 'hazard', 'front'];
export const LIST_OF: Record<MarkKind, MaskList> = { ledge: 'ledges', wall: 'walls', hazard: 'hazards', front: 'fronts' };

/** An item of the draft. */
export interface Picked {
  kind: MarkKind;
  id: string;
}

/**
 * Where a press landed on an item: an end of its line (`start` is x0, or a wall's y0), the line
 * itself, one of a front's points, or inside a front.
 */
export interface Hit extends Picked {
  part: 'start' | 'end' | 'line' | 'point' | 'inside';
  /** Which of a front's points. */
  point?: number;
}

/** The room the draft is painted over: its size, and the ground line's room y (tops are above it). */
export interface Frame {
  size: { w: number; h: number };
  ground: number;
}

/** The shortest line the editor keeps or draws (room px): a shorter drag is taken for a tap. */
export const MIN_SPAN = 8;
/** How many changes back Undo goes. */
export const UNDO_STEPS = 50;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const topOf = (y: number, frame: Frame) => clamp(Math.round(frame.ground - y), 1, MAX_PERCH_TOP);
type Item = LedgeMark | WallMark | HazardMark | FrontMark;
/** A draft as text, its lists in a fixed order: two drafts are the same when theirs are. */
const canon = (d: MaskDraft) => JSON.stringify([d.ledges, d.walls, d.hazards, d.fronts]);

/** The next free id for a new item of this kind: one past the highest `<kind>-<n>` in the draft. */
export function nextId(draft: MaskDraft, kind: MarkKind): string {
  const own = new RegExp(`^${kind}-(\\d+)$`);
  let n = 0;
  for (const list of MASK_LISTS) {
    for (const item of draft[list]) {
      const m = own.exec(item.id);
      const k = m ? Number(m[1]) : 0;
      if (Number.isSafeInteger(k) && k < 1e9) n = Math.max(n, k);
    }
  }
  return `${kind}-${n + 1}`;
}

/** The item `p` names, if the draft has it. */
export function find(draft: MaskDraft, p: Picked): Item | undefined {
  return (draft[LIST_OF[p.kind]] as Item[]).find((i) => i.id === p.id);
}

/**
 * What a press at `p` lands on, `tol` room px at most away: an end or a point first (the nearest),
 * then a line (the nearest), then the front drawn last that it is inside.
 */
export function hitTest(draft: MaskDraft, p: Vec2, tol: number, ground: number): Hit | null {
  const best: { hit: Hit | null; d: number } = { hit: null, d: Number.POSITIVE_INFINITY };
  const near = (hit: Hit, d: number) => {
    if (d <= tol && d < best.d) {
      best.hit = hit;
      best.d = d;
    }
  };
  const spans: Array<[MarkKind, Array<LedgeMark | HazardMark>]> = [
    ['ledge', draft.ledges],
    ['hazard', draft.hazards],
  ];
  for (const [kind, list] of spans) {
    for (const s of list) {
      near({ kind, id: s.id, part: 'start' }, distance(p, { x: s.x0, y: ground - s.top }));
      near({ kind, id: s.id, part: 'end' }, distance(p, { x: s.x1, y: ground - s.top }));
    }
  }
  for (const w of draft.walls) {
    near({ kind: 'wall', id: w.id, part: 'start' }, distance(p, { x: w.x, y: w.y0 }));
    near({ kind: 'wall', id: w.id, part: 'end' }, distance(p, { x: w.x, y: w.y1 }));
  }
  for (const f of draft.fronts) f.points.forEach((q, i) => near({ kind: 'front', id: f.id, part: 'point', point: i }, distance(p, q)));
  if (best.hit) return best.hit;
  const along = (a: Vec2, b: Vec2) => distance(p, closestPointOnSegment(p, a, b));
  for (const [kind, list] of spans) for (const s of list) near({ kind, id: s.id, part: 'line' }, along({ x: s.x0, y: ground - s.top }, { x: s.x1, y: ground - s.top }));
  for (const w of draft.walls) near({ kind: 'wall', id: w.id, part: 'line' }, along({ x: w.x, y: w.y0 }, { x: w.x, y: w.y1 }));
  for (const f of draft.fronts) f.points.forEach((q, i) => near({ kind: 'front', id: f.id, part: 'line' }, along(q, f.points[(i + 1) % f.points.length]!)));
  if (best.hit) return best.hit;
  for (let i = draft.fronts.length - 1; i >= 0; i--) {
    const f = draft.fronts[i]!;
    if (pointInPolygon(p, f.points)) return { kind: 'front', id: f.id, part: 'inside' };
  }
  return null;
}

/**
 * The draft with `hit`'s part dragged by (to - from): an end along its line, a ledge's or a hazard's
 * line up or down (its top), a wall's sideways, a front's point anywhere, a front (pressed inside, or
 * on an edge) whole. `before` is the draft as the press found it. Kept inside the room, an end at
 * least MIN_SPAN from the other, a top within reach.
 */
export function dragged(before: MaskDraft, hit: Hit, from: Vec2, to: Vec2, frame: Frame): MaskDraft {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const { w, h } = frame.size;
  const list = LIST_OF[hit.kind];
  const swap = <T extends { id: string }>(items: T[], change: (item: T) => T): T[] => items.map((i) => (i.id === hit.id ? change(i) : i));
  if (list === 'walls') {
    return {
      ...before,
      walls: swap(before.walls, (m) =>
        hit.part === 'start' ? { ...m, y0: clamp(Math.round(m.y0 + dy), 0, m.y1 - MIN_SPAN) } : hit.part === 'end' ? { ...m, y1: clamp(Math.round(m.y1 + dy), m.y0 + MIN_SPAN, h) } : { ...m, x: clamp(Math.round(m.x + dx), 0, w) },
      ),
    };
  }
  if (list === 'fronts') {
    return {
      ...before,
      fronts: swap(before.fronts, (m) => {
        if (hit.part === 'point' && hit.point !== undefined) return { ...m, points: m.points.map((q, i) => (i === hit.point ? { x: clamp(Math.round(q.x + dx), 0, w), y: clamp(Math.round(q.y + dy), 0, h) } : q)) };
        // The whole front, as far as the room lets every point go.
        const xs = m.points.map((q) => q.x);
        const ys = m.points.map((q) => q.y);
        const mx = Math.round(clamp(dx, -Math.min(...xs), w - Math.max(...xs)));
        const my = Math.round(clamp(dy, -Math.min(...ys), h - Math.max(...ys)));
        return { ...m, points: m.points.map((q) => ({ x: q.x + mx, y: q.y + my })) };
      }),
    };
  }
  const span = (m: LedgeMark | HazardMark) =>
    hit.part === 'start' ? { ...m, x0: clamp(Math.round(m.x0 + dx), 0, m.x1 - MIN_SPAN) } : hit.part === 'end' ? { ...m, x1: clamp(Math.round(m.x1 + dx), m.x0 + MIN_SPAN, w) } : { ...m, top: clamp(Math.round(m.top - dy), 1, MAX_PERCH_TOP) };
  return list === 'ledges' ? { ...before, ledges: swap(before.ledges, span) } : { ...before, hazards: swap(before.hazards, span) };
}

/**
 * A new line drawn by dragging from `a` to `b` on empty ground: a ledge or a hazard along the drag at
 * the press's height, a wall up or down it at the press's x; null for a drag under MIN_SPAN long.
 */
export function drawnMark(kind: 'ledge' | 'hazard', a: Vec2, b: Vec2, frame: Frame): Omit<LedgeMark, 'id'> | null;
export function drawnMark(kind: 'wall', a: Vec2, b: Vec2, frame: Frame): Omit<WallMark, 'id'> | null;
export function drawnMark(kind: 'ledge' | 'hazard' | 'wall', a: Vec2, b: Vec2, frame: Frame): Omit<LedgeMark, 'id'> | Omit<WallMark, 'id'> | null {
  const { w, h } = frame.size;
  if (kind === 'wall') {
    const y0 = clamp(Math.round(Math.min(a.y, b.y)), 0, h);
    const y1 = clamp(Math.round(Math.max(a.y, b.y)), 0, h);
    return y1 - y0 < MIN_SPAN ? null : { x: clamp(Math.round(a.x), 0, w), y0, y1 };
  }
  const x0 = clamp(Math.round(Math.min(a.x, b.x)), 0, w);
  const x1 = clamp(Math.round(Math.max(a.x, b.x)), 0, w);
  return x1 - x0 < MIN_SPAN ? null : { x0, x1, top: topOf(a.y, frame) };
}

/** The selected item's numbers, as the panel shows them. */
export function readout(draft: MaskDraft, p: Picked): string {
  const item = find(draft, p);
  if (!item) return '';
  const n = (v: number) => String(Math.round(v));
  if ('points' in item) return `${item.id}  ${item.points.length} points`;
  if ('y0' in item) return `${item.id}  x ${n(item.x)}  y0 ${n(item.y0)}  y1 ${n(item.y1)}`;
  return `${item.id}  x0 ${n(item.x0)}  x1 ${n(item.x1)}  top ${n(item.top)}`;
}

/**
 * The draft's ledges as perches, for an owl to stand on in this page (the painter's Try): each a
 * strip of the floor from x0 to x1, as deep as the floor's own strip (`floor`, the room's walkable).
 */
export function trialPerches(ledges: readonly LedgeMark[], floor: readonly Polygon[]): Perch[] {
  const ys = floor.flat().map((p) => p.y);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  return ledges.map((l) => ({
    id: l.id,
    top: l.top,
    area: [
      { x: l.x0, y: y0 },
      { x: l.x1, y: y0 },
      { x: l.x1, y: y1 },
      { x: l.x0, y: y1 },
    ],
  }));
}

/** What the painter's state is: the draft, the tool, the item picked, the front being drawn and the undo steps. */
export class PaintEditor {
  draft: MaskDraft;
  tool: Tool = 'select';
  selected: Picked | null = null;
  /** A front being drawn: its points so far, a tap each. */
  pending: Vec2[] | null = null;
  private readonly past: MaskDraft[] = [];
  /** The draft as it was last saved (canon), or null when this one was never saved. */
  private savedAs: string | null;

  constructor(draft: MaskDraft, saved: boolean) {
    this.draft = draft;
    this.savedAs = saved ? canon(draft) : null;
  }

  /** Whether the draft differs from what was last saved (a draft never saved always does). */
  get unsaved(): boolean {
    return canon(this.draft) !== this.savedAs;
  }

  /** `draft` (the draft as it was sent) was saved. */
  markSaved(draft: MaskDraft): void {
    this.savedAs = canon(draft);
  }

  get canUndo(): boolean {
    return this.pending !== null || this.past.length > 0;
  }

  /** A change, which Undo can take back. */
  change(next: MaskDraft): void {
    this.settle(this.draft, next);
  }

  /** A drag under way: the draft as it is now, with no undo step yet (`settle` makes one when it ends). */
  preview(next: MaskDraft): void {
    this.draft = next;
  }

  /** A drag ended at `next`: one undo step back to `before`, when it changed anything. */
  settle(before: MaskDraft, next: MaskDraft = this.draft): void {
    this.draft = next;
    if (canon(before) === canon(next)) return;
    this.past.push(before);
    if (this.past.length > UNDO_STEPS) this.past.shift();
    this.keepSelection();
  }

  /** Back one step: the front being drawn loses its last point, or the draft goes back one change. */
  undo(): boolean {
    if (this.pending) {
      this.pending.pop();
      if (!this.pending.length) this.pending = null;
      return true;
    }
    const prev = this.past.pop();
    if (!prev) return false;
    this.draft = prev;
    this.keepSelection();
    return true;
  }

  setTool(tool: Tool): void {
    if (tool !== 'front') this.pending = null;
    this.tool = tool;
  }

  /** A new item, picked: its id the next of its kind. */
  add(kind: 'ledge' | 'hazard', mark: Omit<LedgeMark, 'id'>): Picked;
  add(kind: 'wall', mark: Omit<WallMark, 'id'>): Picked;
  add(kind: 'front', mark: Omit<FrontMark, 'id'>): Picked;
  add(kind: MarkKind, mark: Omit<LedgeMark, 'id'> | Omit<WallMark, 'id'> | Omit<FrontMark, 'id'>): Picked {
    const id = nextId(this.draft, kind);
    const list = LIST_OF[kind];
    this.change({ ...this.draft, [list]: [...this.draft[list], { id, ...mark }] });
    this.selected = { kind, id };
    return this.selected;
  }

  /** Delete the item picked; false with none. */
  remove(): boolean {
    const p = this.selected;
    if (!p || !find(this.draft, p)) return false;
    const list = LIST_OF[p.kind];
    this.change({ ...this.draft, [list]: (this.draft[list] as Item[]).filter((i) => i.id !== p.id) });
    this.selected = null;
    return true;
  }

  /**
   * A tap with the front tool: the front's next point, or a tap on its first point (within `tol`)
   * closes it once it has FRONT_POINTS_MIN; a front at FRONT_POINTS_MAX takes no more.
   */
  addPoint(p: Vec2, tol: number): 'added' | 'closed' | 'full' {
    const q = { x: Math.round(p.x), y: Math.round(p.y) };
    const pts = this.pending;
    if (!pts) {
      this.pending = [q];
      return 'added';
    }
    if (pts.length >= FRONT_POINTS_MIN && distance(p, pts[0]!) <= tol) return this.closeFront() ? 'closed' : 'added';
    if (pts.length >= FRONT_POINTS_MAX) return 'full';
    pts.push(q);
    return 'added';
  }

  /** Close the front being drawn into the draft (Enter); false while it has too few points. */
  closeFront(): boolean {
    const pts = this.pending;
    if (!pts || pts.length < FRONT_POINTS_MIN) return false;
    this.pending = null;
    this.add('front', { points: pts });
    return true;
  }

  cancelFront(): void {
    this.pending = null;
  }

  /** What is picked goes once the draft no longer has it. */
  private keepSelection(): void {
    if (this.selected && !find(this.draft, this.selected)) this.selected = null;
  }
}

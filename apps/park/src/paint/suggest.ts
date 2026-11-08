/**
 * The ledge painter's Suggest (OP-156): ledges read off a screen's playfield. The playfield's sky is
 * keyed out, so the tops of what is painted solid are where an owl could stand. In each column of the
 * picture, a top is where clear turns solid going down: alpha of SUGGEST_RULES.solid or more, under at
 * least `clearAbove` clear pixels. Neighbouring columns whose tops are within `sameRow` pixels of each
 * other join into a run (`bridge` columns missing in a run are passed over, as painted edges are
 * ragged), and a run at least `minWidth` room pixels wide is a ledge at its median top, unless that
 * is the ground line itself (under `minTop` above it) or higher than a perch may be (MAX_PERCH_TOP).
 *
 * Framework-free: it reads an alpha channel, so the tests feed it pictures made up as arrays. The
 * painter (game/ledgePainter.ts) reads the screen's playfield from its texture into a canvas.
 */
import { MAX_PERCH_TOP, ROOM_W, backgroundTiles, type LedgeMark, type RoomDef, type RoomTile } from '@owl-park/shared';

/** A picture's alpha, row by row from the top: every `stride`th value from `offset` (a canvas's RGBA data: stride 4, offset 3). */
export interface AlphaPicture {
  alpha: ArrayLike<number>;
  width: number;
  height: number;
  stride?: number;
  offset?: number;
}

export interface SuggestRules {
  /** Alpha at or over this is solid. */
  solid: number;
  /** Clear pixels a top needs right above it (picture px). */
  clearAbove: number;
  /** Tops of neighbouring columns at most this far apart are one run (picture px). */
  sameRow: number;
  /** Columns a run may miss and still go on. */
  bridge: number;
  /** The narrowest run that is a ledge (room px). */
  minWidth: number;
  /** A run lower than this over the ground line is the ground itself (room px). */
  minTop: number;
  /** A run higher than this over the ground line is out of reach (room px). */
  maxTop: number;
}

export const SUGGEST_RULES: SuggestRules = { solid: 128, clearAbove: 6, sameRow: 3, bridge: 1, minWidth: 40, minTop: 10, maxTop: MAX_PERCH_TOP };

/** Where a picture lies in the room: its top left corner (room px), room px per picture px, and the ground line's room y. */
export interface Placement {
  x: number;
  y: number;
  scale: number;
  ground: number;
}

/** A ledge the art suggests, in room px: taken, it becomes the draft's with an id of its own. */
export type Suggestion = Omit<LedgeMark, 'id'>;

/** Each column's tops, top down: the rows where clear turns solid with `clearAbove` clear pixels over it. */
export function columnTops(pic: AlphaPicture, rules: Pick<SuggestRules, 'solid' | 'clearAbove'> = SUGGEST_RULES): number[][] {
  const { alpha, width, height } = pic;
  const stride = pic.stride ?? 1;
  const offset = pic.offset ?? 0;
  const tops: number[][] = Array.from({ length: width }, () => []);
  // Row by row, a count of clear pixels per column: the picture is read in the order it is stored.
  const clear = new Array<number>(width).fill(0);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if ((alpha[(row + x) * stride + offset] ?? 0) >= rules.solid) {
        if (clear[x]! >= rules.clearAbove) tops[x]!.push(y);
        clear[x] = 0;
      } else clear[x]! += 1;
    }
  }
  return tops;
}

interface Run {
  from: number;
  last: number;
  /** The top in the run's last column, which the next column's is compared with. */
  y: number;
  ys: number[];
}

/** The ledges a picture placed `at` in the room suggests, west to east (room px, whole numbers). */
export function suggestLedges(pic: AlphaPicture, at: Placement, rules: SuggestRules = SUGGEST_RULES): Suggestion[] {
  const tops = columnTops(pic, rules);
  const done: Run[] = [];
  let open: Run[] = [];
  for (let x = 0; x < pic.width; x++) {
    const next: Run[] = [];
    const taken = new Set<Run>();
    for (const y of tops[x]!) {
      // The open run this top carries on: the nearest in height, within reach of a bridge.
      let best: Run | null = null;
      for (const r of open) {
        if (taken.has(r) || x - r.last > rules.bridge + 1 || Math.abs(y - r.y) > rules.sameRow) continue;
        if (!best || Math.abs(y - r.y) < Math.abs(y - best.y)) best = r;
      }
      const run = best ?? { from: x, last: x, y, ys: [] };
      run.last = x;
      run.y = y;
      run.ys.push(y);
      taken.add(run);
      next.push(run);
    }
    // A run with no top here waits for the next column while a bridge reaches it, and is done after.
    for (const r of open) if (!taken.has(r)) (x - r.last <= rules.bridge ? next : done).push(r);
    open = next;
  }
  done.push(...open);
  const out: Suggestion[] = [];
  for (const r of done) {
    if ((r.last - r.from + 1) * at.scale < rules.minWidth) continue;
    const ys = [...r.ys].sort((a, b) => a - b);
    const top = Math.round(at.ground - (at.y + ys[Math.floor(ys.length / 2)]! * at.scale));
    if (top < rules.minTop || top > rules.maxTop) continue;
    out.push({ x0: Math.round(at.x + r.from * at.scale), x1: Math.round(at.x + (r.last + 1) * at.scale), top });
  }
  return out.sort((a, b) => a.x0 - b.x0 || a.top - b.top);
}

/** The suggestions no ledge already covers: one within `slack` px of its height over at least half its span. */
export function notYetLedges(found: readonly Suggestion[], ledges: readonly Suggestion[], slack = 6): Suggestion[] {
  return found.filter((s) => !ledges.some((l) => Math.abs(l.top - s.top) <= slack && Math.min(l.x1, s.x1) - Math.max(l.x0, s.x0) >= (s.x1 - s.x0) / 2));
}

/** The playfield at room x: a background tile that scrolls with the room (rate 1) over it, the one drawn last when two are. */
export function playfieldAt(room: RoomDef, x: number): RoomTile | null {
  let found: RoomTile | null = null;
  for (const t of backgroundTiles(room)) if ((t.rate ?? 1) === 1 && x >= t.x && x < t.x + ROOM_W) found = t;
  return found;
}

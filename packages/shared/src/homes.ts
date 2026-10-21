/**
 * Nests (proposal C39): every owl's own home, on the street outside the turnstiles. The street
 * (`homes`) has six nest doors: door 0 is always the visitor's own nest, doors 1 to 5 other owls'
 * open nests. A nest is a cosy round room inside a trunk (NEST_ROOM in ../rooms) whose owner arranges
 * the furniture it owns on twelve spots and opens it to visitors or closes it; visitors only look.
 * Furniture is a kind of thing an owl owns that is used only in nests: four pieces to start with and
 * a free one every park day.
 *
 * Pure rules shared by the room server, the local mode and the tests. It is all free and needs no
 * ticket; nobody types anything and no names are shown, so a nest holds nothing but approved pieces
 * in its spots. Every word visitors see and every number here is a default the owner may change.
 */
import { DUPLICATE_FEATHERS } from './collectibles';
import { parkDay } from './parktime';
import type { OwlLook } from './protocol';
import { isObj } from './validate';

// ---------- the words visitors see ----------

/** What the nests say to visitors, all in one place. */
export const NEST_WORDS = {
  /** The way from the lobby's west end to the street. */
  toNests: 'To the nests',
  /** Door 0 on the street. */
  yourNest: 'Your nest',
  decorate: 'Decorate',
  done: 'Done',
  takeAway: 'Take away',
  openToVisitors: 'Open to visitors',
  closedToVisitors: 'Closed to visitors',
  /** On the street door of a nest its owner has closed. */
  closedForNow: 'Closed for now',
  furnitureGift: "Today's furniture gift",
  /** The gift button once today's is taken. */
  nextGift: 'Next gift tomorrow',
  /** Before the name of the piece the gift brought. */
  newPiece: 'New for your nest:',
  /** After the feathers the gift brings an owl that owns every piece. */
  everyPiece: 'You have every piece already!',
  /** Where the spot being decorated is. */
  onTheFloor: 'On the floor',
  onTheWall: 'On the wall',
  /** A spot for which the owl owns no piece yet. */
  noPieces: "No pieces for this spot yet. Each day's furniture gift brings a new one.",
  /** The street or a nest did not answer. */
  notAnswering: 'The nests are not answering just now. Try again in a moment.',
} as const;

// ---------- the street ----------

export const STREET_ROOM = 'homes';
/** Nest doors along the street, `nest-door-0` to `nest-door-5`, each with a `from-nest-<n>` spawn in front. */
export const STREET_DOORS = 6;

const NEST_DOOR_ID = /^nest-door-(0|[1-9][0-9]?)$/;

/** Which nest door of the street a door is: 0 (the visitor's own nest) to 5; null for any other door. */
export function nestDoorIndex(doorId: unknown): number | null {
  if (typeof doorId !== 'string') return null;
  const m = NEST_DOOR_ID.exec(doorId);
  const n = m ? Number(m[1]) : NaN;
  return n < STREET_DOORS ? n : null;
}

// ---------- furniture ----------

export type FurniturePlace = 'floor' | 'wall';

export interface Furniture {
  id: string;
  /** Visitor-facing. */
  name: string;
  /** Floor pieces stand in floor spots, wall pieces hang in wall spots. */
  place: FurniturePlace;
  /** Art key: `decor-<id>`. */
  art: string;
  /** Logical art size in room pixels; the piece is drawn with its bottom centre on its spot. */
  size: { w: number; h: number };
  /** Lies flat on the floor, like a rug: owls are drawn on top of it rather than sorted in depth with it. */
  flat?: true;
}

const piece = (id: string, name: string, place: FurniturePlace, w: number, h: number): Furniture => ({ id, name, place, art: `decor-${id}`, size: { w, h } });
const flat = (f: Furniture): Furniture => ({ ...f, flat: true });

/** The first set: sixteen pieces, sized beside an owl (about 100 x 120 room pixels as drawn). */
export const FURNITURE: readonly Furniture[] = [
  flat(piece('rug', 'Rug', 'floor', 240, 100)),
  piece('armchair', 'Armchair', 'floor', 150, 150),
  piece('bookshelf', 'Bookshelf', 'floor', 150, 230),
  piece('lamp', 'Lamp', 'floor', 120, 210),
  piece('potted-fern', 'Potted fern', 'floor', 130, 150),
  piece('mushroom-stool', 'Mushroom stool', 'floor', 120, 100),
  piece('quilt-bed', 'Quilt bed', 'floor', 260, 170),
  piece('acorn-bowl', 'Acorn bowl', 'floor', 120, 90),
  piece('teapot-table', 'Teapot table', 'floor', 170, 140),
  piece('wall-clock', 'Wall clock', 'wall', 100, 140),
  piece('framed-leaf', 'Framed leaf', 'wall', 110, 140),
  piece('window-box', 'Window box', 'wall', 180, 110),
  piece('lantern-string', 'String of lanterns', 'wall', 180, 100),
  flat(piece('moss-rug', 'Moss rug', 'floor', 220, 100)),
  piece('stump-table', 'Stump table', 'floor', 160, 120),
  piece('feather-mobile', 'Feather mobile', 'wall', 110, 160),
];

/** Every owl owns these from the start. */
export const STARTER_FURNITURE: readonly string[] = ['rug', 'lamp', 'potted-fern', 'stump-table'];

const FURNITURE_BY_ID: ReadonlyMap<string, Furniture> = new Map(FURNITURE.map((f) => [f.id, f]));

/** The catalogue's piece for an id; null for anything else. */
export function getFurniture(id: unknown): Furniture | null {
  return typeof id === 'string' ? (FURNITURE_BY_ID.get(id) ?? null) : null;
}

// ---------- the nest's spots ----------

export type NestSpotId = 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6' | 'f7' | 'f8' | 'w1' | 'w2' | 'w3' | 'w4';

export interface NestSpot {
  id: NestSpotId;
  place: FurniturePlace;
  /** Where the piece's bottom centre goes, in nest-room pixels. */
  x: number;
  y: number;
}

/**
 * Twelve spots in the nest. On the floor, f1 to f4 along the back wall and f5 to f8 nearer the front,
 * between them, all clear of the door in the west wall. On the back wall, w1 to w4, two each side of
 * the round window between the shelves and the hearth, staggered, and high enough that the tallest
 * floor piece standing beneath leaves them showing.
 */
export const NEST_SPOTS: readonly NestSpot[] = [
  { id: 'f1', place: 'floor', x: 410, y: 700 },
  { id: 'f2', place: 'floor', x: 670, y: 660 },
  { id: 'f3', place: 'floor', x: 930, y: 660 },
  { id: 'f4', place: 'floor', x: 1190, y: 700 },
  { id: 'f5', place: 'floor', x: 540, y: 810 },
  { id: 'f6', place: 'floor', x: 800, y: 800 },
  { id: 'f7', place: 'floor', x: 1060, y: 800 },
  { id: 'f8', place: 'floor', x: 1320, y: 810 },
  { id: 'w1', place: 'wall', x: 380, y: 450 },
  { id: 'w2', place: 'wall', x: 540, y: 360 },
  { id: 'w3', place: 'wall', x: 1060, y: 360 },
  { id: 'w4', place: 'wall', x: 1190, y: 450 },
];

const SPOTS_BY_ID: ReadonlyMap<string, NestSpot> = new Map(NEST_SPOTS.map((s) => [s.id, s]));

/** The nest spot for an id; null for anything else. */
export function getNestSpot(id: unknown): NestSpot | null {
  return typeof id === 'string' ? (SPOTS_BY_ID.get(id) ?? null) : null;
}

/** What stands where in a nest: spot -> furniture id. A piece stands in one spot at most. */
export type NestLayout = Partial<Record<NestSpotId, string>>;

/** The owner's colours, for the flag on its nest's street door: nothing else of its look. */
export type NestLook = Pick<OwlLook, 'body' | 'belly' | 'accent'>;

/** Only the three colours of a look (no species, wear or pledge). */
export function nestLook(look: OwlLook): NestLook {
  return { body: look.body, belly: look.belly, accent: look.accent };
}

/** A nest as visitors see it. It never carries its owner's collector id, and no names. */
export interface NestView {
  /** The nest's own id; its room is `nest-<nestId>`. */
  nestId: string;
  /** Open to visitors; a closed nest lets only its owner in. */
  open: boolean;
  layout: NestLayout;
  /** The owner's colours, for the flag on the nest's street door. */
  look?: NestLook;
}

// ---------- decorating ----------

/**
 * Why a piece cannot go in a spot: no such spot, the owl does not own the piece, a floor piece in
 * a wall spot or the other way round, or no such piece.
 */
export type NestRefusal = 'spot' | 'not-owned' | 'wrong-place' | 'unknown';

export type NestPlaceResult = { ok: true; layout: NestLayout } | { ok: false; reason: NestRefusal };

/**
 * Put a piece the owl owns in a spot of its place, or with `item` null take the spot's piece away.
 * A piece standing in another spot moves (that spot empties); a piece already in the spot goes back
 * to the owl. Returns the new layout and leaves the one it was given as it was.
 */
export function placeFurniture(layout: NestLayout, spot: string, item: string | null, owned: readonly string[] | ReadonlySet<string>): NestPlaceResult {
  const at = getNestSpot(spot);
  if (!at) return { ok: false, reason: 'spot' };
  if (item !== null) {
    const p = getFurniture(item);
    if (!p) return { ok: false, reason: 'unknown' };
    if (p.place !== at.place) return { ok: false, reason: 'wrong-place' };
    if (!new Set(owned).has(p.id)) return { ok: false, reason: 'not-owned' };
  }
  const next: NestLayout = {};
  for (const s of NEST_SPOTS) {
    const here = s.id === at.id ? item : layout[s.id];
    if (here && (s.id === at.id || here !== item)) next[s.id] = here;
  }
  return { ok: true, layout: next };
}

/** One change the owner asks for in its nest: a spot's piece (null takes it away), or open or closed to visitors. */
export type NestEdit = { spot: string; item: string | null } | { open: boolean };

const EDIT_ID = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * Parse a nest edit from a page; null for anything malformed. Ids only need the right form: an
 * unknown spot or piece is passed on, so that placeFurniture can refuse it with a reason. Other keys
 * (a frame's type and request number) are ignored.
 */
export function parseNestEdit(v: unknown): NestEdit | null {
  if (!isObj(v)) return null;
  const spot = v['spot'];
  const open = v['open'];
  if ((spot === undefined) === (open === undefined)) return null; // exactly one change at a time
  if (open !== undefined) return typeof open === 'boolean' ? { open } : null;
  if (typeof spot !== 'string' || !EDIT_ID.test(spot)) return null;
  const item = v['item'];
  if (item === null) return { spot, item: null };
  return typeof item === 'string' && EDIT_ID.test(item) ? { spot, item } : null;
}

/**
 * A stored layout, cleaned: known spots only, each holding a catalogue piece of its place. A piece
 * found in more than one spot stays in the first, in spot order (f1 to f8, then w1 to w4).
 */
export function sanitizeLayout(v: unknown): NestLayout {
  const out: NestLayout = {};
  if (!isObj(v)) return out;
  const used = new Set<string>();
  for (const s of NEST_SPOTS) {
    const p = Object.hasOwn(v, s.id) ? getFurniture(v[s.id]) : null;
    if (!p || p.place !== s.place || used.has(p.id)) continue;
    used.add(p.id);
    out[s.id] = p.id;
  }
  return out;
}

// ---------- nest ids and rooms ----------

/**
 * A nest's id: eight lower-case letters and digits, picked at random by the server once per
 * collector and kept. It never comes from the collector id, which other visitors must not learn.
 */
export const NEST_ID_LENGTH = 8;
const NEST_ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const NEST_ID = /^[a-z0-9]{8}$/;
const NEST_ROOM_ID = /^nest-([a-z0-9]{8})$/;

export function isNestId(v: unknown): v is string {
  return typeof v === 'string' && NEST_ID.test(v);
}

/** A nest's room id, `nest-<nestId>`. */
export function isNestRoom(id: unknown): id is string {
  return typeof id === 'string' && NEST_ROOM_ID.test(id);
}

/** The room of a nest; null when `nestId` is not a nest id. */
export function nestRoomId(nestId: string): string | null {
  return isNestId(nestId) ? `nest-${nestId}` : null;
}

/** The nest id of a nest's room; null for any other room id. */
export function nestIdOf(roomId: unknown): string | null {
  if (typeof roomId !== 'string') return null;
  return NEST_ROOM_ID.exec(roomId)?.[1] ?? null;
}

/** An index below `n` from a source of numbers in [0, 1); one that strays outside it still lands in range. */
function pick(random: () => number, n: number): number {
  const i = Math.floor(random() * n);
  return Number.isFinite(i) ? Math.min(n - 1, Math.max(0, i)) : 0;
}

/** A new nest id from a random source (the server passes a strong one). */
export function randomNestId(random: () => number): string {
  let id = '';
  for (let i = 0; i < NEST_ID_LENGTH; i++) id += NEST_ID_CHARS[pick(random, NEST_ID_CHARS.length)];
  return id;
}

// ---------- the day's furniture gift ----------

/** An owl that owns every piece gets feathers instead: what a common collectible pays when it comes again. */
export const FURNITURE_GIFT_FEATHERS = DUPLICATE_FEATHERS.common;

export type FurnitureGift = { item: string; feathers: 0 } | { item: null; feathers: number };

/** Today's free gift for an owl that owns `owned`: a piece it does not own yet, at random, or feathers once it owns them all. */
export function furnitureGift(owned: readonly string[] | ReadonlySet<string>, random: () => number): FurnitureGift {
  const have = new Set(owned);
  const missing = FURNITURE.filter((f) => !have.has(f.id));
  if (!missing.length) return { item: null, feathers: FURNITURE_GIFT_FEATHERS };
  return { item: missing[pick(random, missing.length)]!.id, feathers: 0 };
}

/**
 * Whether the furniture gift is there to take at `now`, for an owl that last took one on park day
 * `lastDay` (null or undefined: never): once a park day, new at midnight in the park.
 */
export function furnitureGiftReady(lastDay: string | null | undefined, now: number): boolean {
  return lastDay !== parkDay(now);
}

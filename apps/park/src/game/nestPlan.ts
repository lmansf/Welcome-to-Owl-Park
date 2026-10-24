import { FURNITURE, NEST_SPOTS, STREET_DOORS, STREET_ROOM, getNestSpot, isNestId, type Furniture, type NestLayout, type NestLook, type NestSpot, type NestSpotId } from '@owl-park/shared';

/**
 * The nests' plain rules on this side, kept apart from Phaser so they can be tested: how furniture
 * sorts in depth, what the Decorate sheet offers for a spot, who lives behind each street door,
 * where an owl comes back out of a nest, and the mirror's (OP-077): its one glint, and where Q goes;
 * and the nest's welcome, once (OP-105).
 */

/** Wall pieces hang in front of the painted wall and behind everything on the floor. */
export const WALL_DEPTH = 2;
/** Rugs lie on the floor, under every owl and every other piece. */
export const FLAT_DEPTH = 1.5;

/** Where a piece is drawn in depth: wall pieces and rugs behind every owl, the rest sorted with the owls by their spot. */
export function pieceDepth(spot: NestSpot, piece: Furniture): number {
  if (spot.place === 'wall') return WALL_DEPTH;
  return piece.flat ? FLAT_DEPTH : spot.y;
}

/** A piece the owner could put in a spot, and the spot it stands in now (null: put away). */
export interface PieceChoice {
  piece: Furniture;
  at: NestSpotId | null;
}

/** The pieces the owner owns that fit a spot (floor pieces for the floor, wall pieces for the wall), in catalogue order. */
export function piecesFor(spot: NestSpotId, owned: readonly string[], layout: NestLayout): PieceChoice[] {
  const s = getNestSpot(spot);
  if (!s) return [];
  const have = new Set(owned);
  const where = new Map<string, NestSpotId>();
  for (const at of NEST_SPOTS) {
    const item = layout[at.id];
    if (item) where.set(item, at.id);
  }
  return FURNITURE.filter((f) => f.place === s.place && have.has(f.id)).map((piece) => ({ piece, at: where.get(piece.id) ?? null }));
}

/** The spot `step` places on from `from`, round all twelve: the floor's eight, then the wall's four. */
export function stepSpot(from: NestSpotId, step: number): NestSpotId {
  const n = NEST_SPOTS.length;
  const i = Math.max(0, NEST_SPOTS.findIndex((s) => s.id === from));
  return NEST_SPOTS[(((i + step) % n) + n) % n]!.id;
}

/** A spot's place in the round, counted from 1, for the Decorate sheet. */
export function spotNumber(id: NestSpotId): number {
  return NEST_SPOTS.findIndex((s) => s.id === id) + 1;
}

/** Who lives behind the street's doors, as the room answered for this visitor. */
export interface StreetView {
  /** The visitor's own nest, behind door 0; null when it could not be had just now. */
  own: { nestId: string; open: boolean } | null;
  /** Doors 1 to 5: an owl's open nest with its owner's colours, or nobody's. */
  doors: ReadonlyArray<{ nestId: string; look: NestLook | null } | null>;
}

/** One street door as drawn: the visitor's own, someone's open nest, or nobody's. */
export type StreetDoor = { kind: 'own'; nestId: string | null } | { kind: 'nest'; nestId: string; look: NestLook | null } | { kind: 'empty' };

/** The six doors for a street answer (none yet: the own door with no nest, the rest empty); a malformed nest id leaves its door empty. */
export function streetDoors(view: StreetView | null): StreetDoor[] {
  const own = view?.own && isNestId(view.own.nestId) ? view.own.nestId : null;
  const out: StreetDoor[] = [{ kind: 'own', nestId: own }];
  for (let n = 1; n < STREET_DOORS; n++) {
    const d = view?.doors[n - 1];
    out.push(d && isNestId(d.nestId) && d.nestId !== own ? { kind: 'nest', nestId: d.nestId, look: d.look } : { kind: 'empty' });
  }
  return out;
}

const FROM_NEST = /^from-nest-([0-9])$/;

/** The street spawn an owl comes back out at: in front of the door it went in by, else in front of its own. */
export function streetSpawnBack(cameFrom: { room: string; spawn?: string | undefined } | undefined): string {
  const m = cameFrom?.room === STREET_ROOM ? FROM_NEST.exec(cameFrom.spawn ?? '') : null;
  return m && Number(m[1]) < STREET_DOORS ? `from-nest-${m[1]}` : 'from-nest-0';
}

/** Whether this device has seen its nest's mirror glint (OP-077). */
export const MIRROR_GLINT_KEY = 'owl-park:mirror-glint';
export const NEST_WELCOME_KEY = 'owl-park:nest-welcome';

/** True the first time this device asks under `key`, and false ever after; false where the browser keeps nothing. */
function firstTime(storage: Pick<Storage, 'getItem' | 'setItem'> | null, key: string): boolean {
  if (!storage) return false;
  try {
    if (storage.getItem(key)) return false;
    storage.setItem(key, '1');
    return true;
  } catch {
    return false;
  }
}

/**
 * The mirror glints the first time a device's owl is home (OP-077), with no words: true that once,
 * and false ever after. A browser that keeps nothing gets no glint, rather than one every visit.
 */
export function firstGlint(storage: Pick<Storage, 'getItem' | 'setItem'> | null): boolean {
  return firstTime(storage, MIRROR_GLINT_KEY);
}

/**
 * The welcome card the first time a device's owl is in its own nest (OP-105), saying the park is out
 * of the door: once, as the glint, and never in a browser that keeps nothing (rather than every visit).
 */
export function firstNestWelcome(storage: Pick<Storage, 'getItem' | 'setItem'> | null): boolean {
  return firstTime(storage, NEST_WELCOME_KEY);
}

/** Where the page stands when Q is pressed. */
export interface MirrorKeyState {
  /** Your owl is open. */
  owlOpen: boolean;
  /** Another screen that takes the keys is open (the Menu, Settings, the quests...). */
  blocking: boolean;
  /** The home screen is up, and whether this device holds an owl yet. */
  atHome: boolean;
  loggedIn: boolean;
}

/**
 * What Q does now that Your owl is at the mirror in the owl's nest (OP-077): it closes Your owl if
 * open; on the home screen it goes into the nest, as Play does (OP-105), once there is an owl; in the
 * park it goes to the mirror (RoomScene.toMirror: walking up to it in a nest, else home to stand
 * before it). Nothing while another screen is open.
 */
export function mirrorKey(s: MirrorKeyState): 'close' | 'nest' | 'mirror' | null {
  if (s.owlOpen) return 'close';
  if (s.blocking) return null;
  if (s.atHome) return s.loggedIn ? 'nest' : null;
  return 'mirror';
}

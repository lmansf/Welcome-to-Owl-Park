/**
 * Style sets (OP-110). Every collectible and piece of furniture has the style of the place it comes
 * from: the park's own things are `hub`, a season's drop is `seasonal`, and each realm brings a style
 * of its own as it opens (a neutral id, never a realm's working name). A set is a few things of one
 * style, for a realm five collectibles and three pieces of furniture: an owl that has them all is
 * given the set's capstone, a piece of furniture only the set gives. No rule makes a nest match; any
 * piece stands anywhere.
 *
 * Settled as the ticket recommends: a set can be completed at any time (a realm closed for the season
 * too); a thing that comes again counts once, and what a duplicate pays is unchanged; the Collection
 * tab shows a capstone as a silhouette until it is earned; the sets sit beside the collection's total
 * (OP-107's percentage) and are not part of it.
 *
 * TODO-DOCS (OP-110): docs/COLLECTIBLES.md (each item's style, `hub` unless it names another, Drop 1
 * `seasonal`; the sets, their capstones and when one is given) and docs/NESTS.md (a capstone is
 * furniture the day's gift never gives).
 */
import { HUB_STYLE, ITEMS, parseVariant, type ItemDef } from './collectibles';
import { FURNITURE, STARTER_FURNITURE, getFurniture, type Furniture } from './homes';

/** A thing's style: its own, or the park's when it names none. */
export function styleOf(thing: { style?: string }): string {
  return thing.style ?? HUB_STYLE;
}

export interface StyleSet {
  /** The style, which is also the set's id: one set per style. */
  style: string;
  /** Visitor-facing. */
  name: string;
  /** Catalogue item ids; any colourway of one counts. */
  collectibles: readonly string[];
  /** Furniture ids. */
  furniture: readonly string[];
  /** The piece of furniture (marked `capstone`) the set gives once everything above is the owl's. */
  capstone: string;
}

/**
 * The sets, as the realms bring them. None yet: a realm's set comes with its sub-ticket's list of
 * pieces and Logan's picks of their art. Everything below works on whatever is listed here.
 */
export const STYLE_SETS: readonly StyleSet[] = [];

/** One thing a set asks for, and whether the owl has it. */
export interface SetPiece {
  id: string;
  kind: 'collectible' | 'furniture';
  /** Visitor-facing. */
  name: string;
  owned: boolean;
}

/** Where an owl stands with a set. */
export interface SetProgress {
  style: string;
  name: string;
  pieces: SetPiece[];
  have: number;
  of: number;
  /** Everything gathered: the capstone is the owl's, or will be the next time the park reads its furniture. */
  done: boolean;
  capstone: { id: string; name: string; art: string; owned: boolean };
}

const itemOf = (id: string): ItemDef | undefined => (Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined);

/** The catalogue items an owl has some colourway of. */
function itemsOwned(owned: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const id of owned) {
    const v = parseVariant(id);
    if (v) out.add(v.item.id);
  }
  return out;
}

/** Where an owl stands with each set, from the collectibles (variant ids) and the furniture it owns. */
export function setProgress(owned: Iterable<string>, furniture: Iterable<string>, sets: readonly StyleSet[] = STYLE_SETS): SetProgress[] {
  const items = itemsOwned(owned);
  const pieces = new Set(furniture);
  return sets.map((set) => {
    const list: SetPiece[] = [
      ...set.collectibles.map((id): SetPiece => ({ id, kind: 'collectible', name: itemOf(id)?.name ?? id, owned: items.has(id) })),
      ...set.furniture.map((id): SetPiece => ({ id, kind: 'furniture', name: getFurniture(id)?.name ?? id, owned: pieces.has(id) })),
    ];
    const have = list.filter((p) => p.owned).length;
    const cap = getFurniture(set.capstone);
    return {
      style: set.style,
      name: set.name,
      pieces: list,
      have,
      of: list.length,
      done: list.length > 0 && have === list.length,
      capstone: { id: set.capstone, name: cap?.name ?? set.capstone, art: cap?.art ?? `decor-${set.capstone}`, owned: pieces.has(set.capstone) },
    };
  });
}

/** The capstones an owl has earned and not been given yet. */
export function capstonesDue(owned: Iterable<string>, furniture: Iterable<string>, sets: readonly StyleSet[] = STYLE_SETS): string[] {
  return setProgress(owned, furniture, sets)
    .filter((p) => p.done && !p.capstone.owned)
    .map((p) => p.capstone.id);
}

/**
 * What is wrong with a list of sets, in words; empty when nothing is (the tests hold STYLE_SETS to
 * this). Every piece must exist and share its set's style, and every capstone must be marked so,
 * belong to one set only, and not be a piece every owl starts with.
 */
export function styleSetProblems(sets: readonly StyleSet[], catalogue: readonly Furniture[] = FURNITURE): string[] {
  const out: string[] = [];
  const pieceOf = (id: string) => catalogue.find((f) => f.id === id);
  const styles = new Set<string>();
  const capstones = new Set<string>();
  for (const set of sets) {
    const s = set.style;
    if (styles.has(s)) out.push(`${s}: a second set for this style`);
    styles.add(s);
    if (!set.name.trim()) out.push(`${s}: no name`);
    if (!set.collectibles.length && !set.furniture.length) out.push(`${s}: nothing to collect`);
    const seen = new Set<string>();
    for (const id of set.collectibles) {
      const item = itemOf(id);
      if (seen.has(`c:${id}`)) out.push(`${s}: ${id} twice`);
      seen.add(`c:${id}`);
      if (!item) out.push(`${s}: no collectible ${id}`);
      else if (styleOf(item) !== s) out.push(`${s}: ${id} is the ${styleOf(item)} style`);
    }
    for (const id of set.furniture) {
      const piece = pieceOf(id);
      if (seen.has(`f:${id}`)) out.push(`${s}: ${id} twice`);
      seen.add(`f:${id}`);
      if (!piece) out.push(`${s}: no piece of furniture ${id}`);
      else if (piece.capstone) out.push(`${s}: ${id} is a capstone, not a piece to collect`);
      else if (styleOf(piece) !== s) out.push(`${s}: ${id} is the ${styleOf(piece)} style`);
    }
    const cap = pieceOf(set.capstone);
    if (!cap) out.push(`${s}: no piece of furniture ${set.capstone} for the capstone`);
    else {
      if (!cap.capstone) out.push(`${s}: ${cap.id} is not marked as a capstone`);
      if (styleOf(cap) !== s) out.push(`${s}: the capstone ${cap.id} is the ${styleOf(cap)} style`);
      if (STARTER_FURNITURE.includes(cap.id)) out.push(`${s}: the capstone ${cap.id} is a starter piece`);
      if (capstones.has(cap.id)) out.push(`${cap.id}: the capstone of two sets`);
      capstones.add(cap.id);
    }
  }
  for (const f of catalogue) if (f.capstone && !capstones.has(f.id)) out.push(`${f.id}: marked as a capstone, but no set gives it`);
  return out;
}

/**
 * Owl species a visitor can be. Each has its own size and natural colours (a starting point the
 * visitor can still recolour) and, once its painted layers are approved, its own art. Until then
 * a species without art is drawn with the great horned owl's layers at its own size.
 *
 * The screech owl is meant for founders only; that waits for founder status (with tickets), so
 * for now every visitor may choose it (FOUNDER_SPECIES_OPEN).
 */
import type { OwlLook } from './protocol';

export type SpeciesId = 'great-horned' | 'barn' | 'burrowing' | 'snowy' | 'screech';

export interface SpeciesDef {
  id: SpeciesId;
  /** Shown in the owl panel. */
  name: string;
  /** Drawn size relative to the great horned owl. */
  size: number;
  /** Natural colours, offered as a one-tap starting point. */
  natural: { body: string; belly: string; accent: string };
  /** Has its own painted layers (`owl-<id>-body` and so on); otherwise the great horned owl's are used. */
  art: boolean;
  /** Meant for founders only (see FOUNDER_SPECIES_OPEN). */
  founders?: boolean;
}

export const SPECIES: readonly SpeciesDef[] = [
  { id: 'great-horned', name: 'Great horned owl', size: 1, natural: { body: '#8B5A2B', belly: '#F6F1E3', accent: '#C9A227' }, art: true },
  { id: 'barn', name: 'Barn owl', size: 0.92, natural: { body: '#D9A066', belly: '#FFF8EC', accent: '#A67B5B' }, art: true },
  { id: 'burrowing', name: 'Burrowing owl', size: 0.8, natural: { body: '#A67B5B', belly: '#F2E1C1', accent: '#5C4033' }, art: true },
  { id: 'snowy', name: 'Snowy owl', size: 1, natural: { body: '#EDEAE0', belly: '#FFFFFF', accent: '#2F3E5C' }, art: true },
  { id: 'screech', name: 'Screech owl', size: 0.62, natural: { body: '#6B6B6B', belly: '#D6C7B0', accent: '#5C4033' }, art: true, founders: true },
];

/**
 * Every real owl species the park names, in one fixed list: the five a visitor can be (SPECIES)
 * and the barred owl, which only the market's guardian is (OP-112). A realm's guardian names its
 * species from here (GUARDIANS in rooms/index.ts).
 */
export const OWL_SPECIES = ['great-horned', 'barn', 'burrowing', 'snowy', 'screech', 'barred'] as const;
export type OwlSpeciesId = (typeof OWL_SPECIES)[number];

export const DEFAULT_SPECIES: SpeciesId = 'great-horned';
/** Founder-only species are open to every visitor until founder status exists. */
export const FOUNDER_SPECIES_OPEN = true;

const BY_ID: Readonly<Record<string, SpeciesDef>> = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

export function isSpecies(v: unknown): v is SpeciesId {
  return typeof v === 'string' && Object.hasOwn(BY_ID, v);
}

export function getSpecies(id: unknown): SpeciesDef {
  return isSpecies(id) ? BY_ID[id]! : BY_ID[DEFAULT_SPECIES]!;
}

/** The species a look shows (the great horned owl when it names none). */
export function speciesOf(look: Pick<OwlLook, 'species'>): SpeciesDef {
  return getSpecies(look.species);
}

/** Species this visitor may choose (founders-only ones while they are open to all). */
export function selectableSpecies(isFounder = false): SpeciesDef[] {
  return SPECIES.filter((s) => !s.founders || isFounder || FOUNDER_SPECIES_OPEN);
}

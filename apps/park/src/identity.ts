import { DEFAULT_LOOK, isHexColour, isSpecies, lookFromSeed, sanitizeLook, type OwlLook } from '@owl-park/shared';
import type { ParkConfig } from './config';

const LOOK_KEY = 'owl-park:look';
/**
 * The token of this device's collection on the park's server (one collection per device until
 * email linking exists), and of one kept in this browser (local mode).
 */
export const COLLECTOR_KEY = 'owl-park:collector';
export const LOCAL_COLLECTOR_KEY = 'owl-park:local-collector';

/**
 * Whether this device already holds an owl: a look it kept, or a collection. That is all "logged
 * in" means on the home screen (OP-065): the park has no accounts and nobody types a name.
 */
export function holdsOwl(storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    return [LOOK_KEY, COLLECTOR_KEY, LOCAL_COLLECTOR_KEY].some((k) => storage?.getItem(k) != null);
  } catch {
    return false;
  }
}

function randomId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `owl-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
}

/** One owl per page load: a fresh id each time, so a duplicated or restored tab never shares one. */
export function loadPlayerId(cfg: ParkConfig): string {
  return cfg.id ?? randomId();
}

/** The owl's colours follow the visitor across tabs and visits (localStorage). */
export function loadLook(cfg: ParkConfig, playerId: string): OwlLook {
  if (cfg.look) {
    // `?look=body,belly,accent[,species]` (tests and the art preview).
    const [body, belly, accent, species] = cfg.look.split(',').map((s) => s.trim());
    if (isHexColour(body) && isHexColour(belly) && isHexColour(accent)) return { body, belly, accent, ...(isSpecies(species) ? { species } : {}) };
  }
  try {
    const raw = localStorage.getItem(LOOK_KEY);
    if (raw) return sanitizeLook(JSON.parse(raw));
  } catch {
    /* storage unavailable: fall through */
  }
  return cfg.look ? DEFAULT_LOOK : lookFromSeed(playerId);
}

/**
 * This screen lets its owl go (OP-139: it moved to another screen, and a new one is made here): the
 * collector token and the kept look go, and the next pass starts a new owl.
 */
export function forgetOwl(storage: Pick<Storage, 'removeItem'> | null): void {
  try {
    for (const k of [COLLECTOR_KEY, LOOK_KEY]) storage?.removeItem(k);
  } catch {
    /* nothing kept to forget */
  }
}

export function saveLook(look: OwlLook): void {
  try {
    // Colours persist; a pledge is today's state and comes back from the server, not storage.
    const { pledge: _pledge, ...colours } = sanitizeLook(look);
    localStorage.setItem(LOOK_KEY, JSON.stringify(colours));
  } catch {
    /* ignore */
  }
}

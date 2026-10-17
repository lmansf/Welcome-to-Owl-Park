import { DEFAULT_LOOK, isHexColour, lookFromSeed, sanitizeLook, type OwlLook } from '@owl-park/shared';
import type { ParkConfig } from './config';

const LOOK_KEY = 'owl-park:look';

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
    const [body, belly, accent] = cfg.look.split(',').map((s) => s.trim());
    if (isHexColour(body) && isHexColour(belly) && isHexColour(accent)) return { body, belly, accent };
  }
  try {
    const raw = localStorage.getItem(LOOK_KEY);
    if (raw) return sanitizeLook(JSON.parse(raw));
  } catch {
    /* storage unavailable: fall through */
  }
  return cfg.look ? DEFAULT_LOOK : lookFromSeed(playerId);
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

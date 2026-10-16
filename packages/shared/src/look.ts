import type { OwlLook } from './protocol';

/** Colour choices offered in the owl customiser. All are original picks. */
export const BODY_COLOURS = ['#8B5A2B', '#5C4033', '#A67B5B', '#6B6B6B', '#D9C7A5', '#2F3E5C', '#7A5C99', '#3E6B48'];
export const BELLY_COLOURS = ['#F6F1E3', '#E8D8B8', '#D6C7B0', '#BFC9D6', '#F2E1C1', '#E0D4F0'];
export const ACCENT_COLOURS = ['#C9A227', '#FF2AA1', '#00E5FF', '#6E3AFF', '#E07A5F', '#81B29A'];

export const DEFAULT_LOOK: OwlLook = { body: '#8B5A2B', belly: '#F6F1E3', accent: '#C9A227' };

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHexColour(s: unknown): s is string {
  return typeof s === 'string' && HEX.test(s);
}

/** Accepts only well-formed colours; anything else falls back to the default. */
export function sanitizeLook(input: unknown): OwlLook {
  const o = (input ?? {}) as Partial<Record<keyof OwlLook, unknown>>;
  return {
    body: isHexColour(o.body) ? o.body : DEFAULT_LOOK.body,
    belly: isHexColour(o.belly) ? o.belly : DEFAULT_LOOK.belly,
    accent: isHexColour(o.accent) ? o.accent : DEFAULT_LOOK.accent,
  };
}

export function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

/** A deterministic look from an id, for visitors who never customise. */
export function lookFromSeed(seed: string): OwlLook {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return {
    body: BODY_COLOURS[h % BODY_COLOURS.length]!,
    belly: BELLY_COLOURS[(h >>> 8) % BELLY_COLOURS.length]!,
    accent: ACCENT_COLOURS[(h >>> 16) % ACCENT_COLOURS.length]!,
  };
}

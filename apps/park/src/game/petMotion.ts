/**
 * How a pet keeps up with its owl (OP-194), as pure rules Pet.ts draws from: it hops when its owl
 * jumps, and comes back beside its owl when it has been left behind. Every page draws every pet
 * from the owl's own air and place, so the other owls' pets hop and come back the same way, from
 * nothing more than each page already gets.
 */
import { AIRBORNE, GROUNDED, type Air } from '@owl-park/shared';

/**
 * A pet's hop when its owl jumps: `delayMs` after the owl leaves the ground, `ms` long, up to
 * `height` room px at a great horned owl's size. It never goes higher, however high the owl flies.
 */
export const PET_HOP = { delayMs: 100, ms: 300, height: 16 } as const;

/** The owl's air as last drawn, and when the hop under way (if any) began: its owl's take-off (ms). */
export interface PetHop {
  up: boolean;
  from: number;
}

export const NO_HOP: PetHop = { up: false, from: Number.NEGATIVE_INFINITY };

/** Whether a hop that started at `from` is still under way at `now`. */
const hopping = (from: number, now: number): boolean => now < from + PET_HOP.delayMs + PET_HOP.ms;

/**
 * Carry the hop on to `now` given the owl's air: a jump off the ground (rising into the air from
 * standing) starts one; staying up, gliding or flapping starts no more until the owl is down again,
 * and a hop under way is never cut short by a new one.
 */
export function stepHop(h: PetHop, now: number, air: Pick<Air, 's' | 'vz'>): PetHop {
  const up = air.s !== GROUNDED;
  if (!h.up && air.s === AIRBORNE && air.vz > 0 && !hopping(h.from, now)) return { up, from: now };
  return up === h.up ? h : { up, from: h.from };
}

/** How high the pet is off the floor at `now` (room px): 0 before the delay, an arc, then 0 again. */
export function hopHeight(h: PetHop, now: number, size = 1): number {
  const t = (now - h.from - PET_HOP.delayMs) / PET_HOP.ms;
  if (!(t > 0 && t < 1)) return 0;
  return 4 * t * (1 - t) * PET_HOP.height * size;
}

/**
 * Left behind (OP-194): further than `farOwlWidths` owl widths from its trail spot for `farMs`, the
 * pet fades out over `fadeOutMs`, is put just behind its owl and fades in over `fadeInMs`. It comes
 * back at most once in `cooldownMs`, so it never flickers.
 */
export const PET_RESPAWN = { farOwlWidths: 2, farMs: 1000, fadeOutMs: 160, fadeInMs: 220, cooldownMs: 3000 } as const;

/** Since when it has been too far (ms; null near), when it began fading out (null not), when it last came back. */
export interface PetRespawn {
  farSince: number | null;
  fadingFrom: number | null;
  backAt: number;
}

export const SETTLED: PetRespawn = { farSince: null, fadingFrom: null, backAt: Number.NEGATIVE_INFINITY };

/**
 * Carry the left-behind rule on to `now`. `gap` is how far the pet is from its trail spot and
 * `owlWidth` its owl's width (both room px). `snap` says to put it just behind its owl now; `fade`
 * is how much of it shows (0 to 1), to multiply into its owl's alpha.
 */
export function stepRespawn(r: PetRespawn, now: number, gap: number, owlWidth: number): { r: PetRespawn; snap: boolean; fade: number } {
  if (r.fadingFrom !== null) {
    const t = now - r.fadingFrom;
    if (t < PET_RESPAWN.fadeOutMs) return { r, snap: false, fade: 1 - Math.max(0, t) / PET_RESPAWN.fadeOutMs };
    return { r: { farSince: null, fadingFrom: null, backAt: now }, snap: true, fade: 0 };
  }
  const fade = Math.min(1, Math.max(0, (now - r.backAt) / PET_RESPAWN.fadeInMs));
  if (gap <= PET_RESPAWN.farOwlWidths * owlWidth) return { r: r.farSince === null ? r : { ...r, farSince: null }, snap: false, fade };
  const farSince = r.farSince ?? now;
  const due = now - farSince >= PET_RESPAWN.farMs && now - r.backAt >= PET_RESPAWN.cooldownMs;
  return { r: { farSince, fadingFrom: due ? now : null, backAt: r.backAt }, snap: false, fade };
}

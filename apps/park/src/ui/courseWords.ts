import type { CoursePaid, ObjectiveKind } from '@owl-park/shared';

/**
 * Everything a parkour course says to its visitor (OP-224), in one place: drafts for the owner to
 * approve. The objective strip at the top of the screen, and the toasts as the owl reaches a piece
 * of the course or the finish shrine.
 */
export const COURSE_WORDS = {
  /** The objective strip's count of the parts, by the course's objective. */
  parts: { bells: 'Bells rung', breakers: 'Breakers on', seals: 'Seals found' } satisfies Record<ObjectiveKind, string>,
  /** One part done, as the owl reaches it. */
  partDone: { bells: 'Bell rung', breakers: 'Breaker on', seals: 'Seal found' } satisfies Record<ObjectiveKind, string>,
  /** At the finish shrine with parts left. */
  partsFirst: { bells: 'Ring every bell first', breakers: 'Switch on every breaker first', seals: 'Find every seal first' } satisfies Record<ObjectiveKind, string>,
  /** The objective strip's count of the lost feathers. */
  feathers: 'Lost feathers',
  /** A lost feather found (with the count after it). */
  featherFound: 'Lost feather found',
  /** A bench reached: a fall comes back here. */
  bench: 'Checkpoint',
  /** A shortcut opened from its far side. */
  shortcut: 'Shortcut open',
  /** A part or the shrine with no run under way (or one too long ago). */
  idle: 'Start the course at the trail gate',
  /** The gold time beaten, the first time. */
  gold: 'Gold time! A sparkle for your collection.',
  /** All five lost feathers found, at the shrine. */
  emote: 'All five lost feathers! A new emote.',
  /** Every course cleared: the Golden Mouse. */
  mouse: 'Every course cleared! The Golden Mouse is yours.',
} as const;

/** A clear's time as m:ss. */
export function clearTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const feathersOf = (n: number) => `${n} feather${n === 1 ? '' : 's'}`;

/** The finish shrine's line: the time, whether it is a best, and what it paid (a spectator's earns nothing). */
export function clearLine(paid: CoursePaid, keep: string): string {
  const time = `Course clear in ${clearTime(paid.ms)}`;
  if (paid.practice) return `${time}! ${keep}`;
  if (paid.first) return `${time}! +${feathersOf(paid.feathers)}${paid.item ? ' and a new item' : ''}.`;
  const best = paid.best ? ' (a new best)' : '';
  if (paid.why === 'paid-today') return `${time}${best}. This course's feathers for today are paid.`;
  if (paid.why === 'capped' && paid.feathers === 0) return `${time}${best}. Games have paid all they can today.`;
  return `${time}${best}. +${feathersOf(paid.feathers)}.`;
}

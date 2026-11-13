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
  /** At the doorway to the finish with parts left: the door waits, and says how many are done (OP-343). */
  doorWaits: {
    bells: (done: number, of: number) => `Ring every bell to open this door (${done} of ${of} rung)`,
    breakers: (done: number, of: number) => `Switch on every breaker to open this door (${done} of ${of} on)`,
    seals: (done: number, of: number) => `Find every seal to open this door (${done} of ${of} found)`,
  } satisfies Record<ObjectiveKind, (done: number, of: number) => string>,
  /**
   * The tips a course shows in the room, each at the first of the thing it is about and only while the
   * owl is near it (OP-344, courseTips.ts): what the course asks, the moves, and what each new thing does.
   */
  tips: {
    /** At the trail gate's way in: what the course asks, by its objective and how many parts it has. */
    goal: {
      bells: (n: number) => `Ring all ${n} bells, then reach the finish.`,
      breakers: (n: number) => `Switch on all ${n} breakers, then reach the finish.`,
      seals: (n: number) => `Find all ${n} seals, then reach the finish.`,
    } satisfies Record<ObjectiveKind, (n: number) => string>,
    /** Under it: the moves, by what this device plays with. */
    moves: {
      keys: 'Space to jump. Press again in the air to flap.\nHold Space to glide. Shift to dash.',
      touch: 'Tap Jump to jump. Tap again in the air to flap.\nHold Jump to glide. Dash for a quick burst.',
    },
    /** Where the walk first ends: what a fall does, by the course (a course with no line of its own says `fall`). */
    pit: {
      canopy: 'Bramble sends you back to your checkpoint. Cross on the leaves.',
      brush: 'Water sends you back to your checkpoint. Cross on the stones.',
      circuit: 'A fall to the street sends you back to your checkpoint. Cross on the signs.',
    } as Readonly<Record<string, string>>,
    fall: 'A fall sends you back to your checkpoint.',
    /** At the first column of rising air, the first wind, the first ink stone and the first neon sign. */
    updraft: 'Jump into the rising air and hold Jump. It lifts you up.',
    wind: 'Glide into the wind and keep holding Jump. It carries you across.',
    stone: 'Land on an ink stone and it paints a bridge. Cross before it fades.',
    sign: 'A lit sign holds you up. A dark one lets you fall.',
    /** At the first bench, and the first part by the course's objective. */
    bench: 'A bench is a checkpoint. A fall brings you back to the last one you reached.',
    part: { bells: 'Go up to a bell to ring it.', breakers: 'Go up to a breaker to switch it on.', seals: 'Go up to a seal to find it.' } satisfies Record<ObjectiveKind, string>,
  },
  /** The objective strip's count of the lost feathers. */
  feathers: 'Lost feathers',
  /** The objective strip's clock (OP-344): what the gold time is, said while a run can still beat it. */
  goldUnder: (time: string) => `Gold under ${time}`,
  /** A lost feather found (with the count after it). */
  featherFound: 'Lost feather found',
  /** A bench reached: a fall comes back here. */
  bench: 'Checkpoint',
  /** A fall: the owl is back at its bench, or at the way it came in (OP-343). */
  fell: 'Back to your last checkpoint',
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

import { ARCADE_GAMES, GAMES, type ArcadeGame } from '@owl-park/shared';

/**
 * The return to play (OP-379): what a result card shows besides the run's own line. A best kept on this
 * device (not a reward, and not the park's: the park's wall and feathers are the room's), the one
 * activity to try next, and what an empty daily board says.
 */

/** Where this device keeps its bests: one number a game or course, a score (higher is better) or a time in ms (lower is better). */
export const DEVICE_BESTS_KEY = 'owl-park:device-bests';

/** The few calls of a page's storage this needs (a test hands in its own). */
export interface BestStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The page's own storage, or none (a private window may refuse it: the card then shows the park's best alone). */
export function pageStore(): BestStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function read(store: BestStore): Record<string, number> {
  try {
    const v = JSON.parse(store.getItem(DEVICE_BESTS_KEY) ?? '{}') as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1])));
  } catch {
    return {};
  }
}

/**
 * A run's result kept against this device's best for `key`: the best now, whether this run made it, and
 * whether it is the first this device has kept for `key`.
 * `lower` for a time (a course), where less is better. A first run is a best only when it scored: a
 * zero is no best to boast of.
 */
export function recordDeviceBest(store: BestStore | null, key: string, value: number, lower = false): DeviceBest {
  if (!store || !Number.isFinite(value)) return { best: null, isNew: false, first: false };
  const all = read(store);
  const was = all[key];
  const better = value > 0 && (was === undefined || (lower ? value < was : value > was));
  if (better) {
    all[key] = value;
    try {
      store.setItem(DEVICE_BESTS_KEY, JSON.stringify(all));
    } catch {
      /* storage full or refused: shown as a best this once, kept nowhere */
    }
  }
  const best = better ? value : (was ?? null);
  return { best, isNew: better, first: was === undefined };
}

export interface DeviceBest {
  best: number | null;
  isNew: boolean;
  first: boolean;
}

/** The arcade's next cabinet along the hall from this game's: the one activity a result card names next. */
export function nextArcadeGame(game: ArcadeGame): ArcadeGame {
  return ARCADE_GAMES[(ARCADE_GAMES.indexOf(game) + 1) % ARCADE_GAMES.length]!;
}

/** The arcade card's next activity: the game at the next cabinet. */
export function arcadeNextLine(game: ArcadeGame): string {
  return `Next: try ${GAMES[nextArcadeGame(game)].name} at the next cabinet.`;
}

/** The climb card's next activity. */
export const CLIMB_NEXT = 'Next: try a game in the arcade.';

/** A daily board with no score on it yet: an invitation, not a blank (OP-379). */
export const EMPTY_BOARD = { title: 'No scores yet today', call: 'Be the first!' } as const;

/** The arcade screen's header under the game's name: today's best and the owl's own, or the invitation when the board is empty. */
export function arcadeSubline(top: number | null, best: number | null): string {
  const today = top !== null ? `Today's best ${top}` : `${EMPTY_BOARD.title}. ${EMPTY_BOARD.call}`;
  return [today, best !== null ? `Your best ${best}` : ''].filter(Boolean).join(' · ');
}

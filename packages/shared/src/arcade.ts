/**
 * Neon Roost, the arcade (C40, approved 2026-10-21): a room of its own off the market street's east
 * end, with three game cabinets along its back wall under the score wall. Each cabinet is a spot in
 * the room data (a door without `to`) and plays one game, as the visitor's own owl:
 *
 * - Hoot & Hop: hop across lanes of drones and noodle carts; each crossing banks a tier (the next
 *   one is quicker); a hit ends the run. The score is the crossings.
 * - Moon Flap: tap to flap through the gaps between neon branches on a night flight. The score is
 *   the gaps passed.
 * - Nest Knockdown: pull back and launch at stacked neon crates, ten stacks, three shots each; a
 *   stack knocked down in fewer shots scores more. The score is the points.
 *
 * The page plays; the room server starts each run, checks the score against the time the run took,
 * pays from a fixed table under the activities' shared daily cap, and keeps today's scores for the
 * score wall (the leaf-pile and fishing model). A cabinet whose game is not live shows an unlit
 * screen reading "Hatching Soon" (one of the approved closed-sign phrases), and standing at it
 * says so. Every number and every visitor-facing word here is a default the owner may change.
 */
import { CLOSED_SIGNS } from '../rooms';
import type { OwlLook } from './protocol';

export const ARCADE_ROOM = 'arcade';
/** The arcade's name, for visitors. */
export const ARCADE_NAME = 'Neon Roost';

/** The three games, by what you do in them (their names are in GAMES). */
export type ArcadeGame = 'crossing' | 'flight' | 'sling';
export const ARCADE_GAMES: readonly ArcadeGame[] = ['crossing', 'flight', 'sling'];

export function isArcadeGame(v: unknown): v is ArcadeGame {
  return typeof v === 'string' && (ARCADE_GAMES as readonly string[]).includes(v);
}

export interface CabinetDef {
  /** The cabinet's spot in the arcade's room data. */
  spot: string;
  game: ArcadeGame;
  /** Whether its game is playable; a cabinet that is not shows "Hatching Soon". */
  live: boolean;
}

/** The cabinets from west to east: Hoot & Hop, Moon Flap, Nest Knockdown. */
export const CABINETS: readonly CabinetDef[] = [
  { spot: 'cabinet-crossing', game: 'crossing', live: true },
  { spot: 'cabinet-flight', game: 'flight', live: true },
  { spot: 'cabinet-sling', game: 'sling', live: true },
];

/** What a cabinet whose game is not live yet says, on its screen and to an owl standing at it. */
export const CABINET_OFF: (typeof CLOSED_SIGNS)[number] = 'Hatching Soon';

/** The cabinet at this spot of the arcade, if there is one. */
export function cabinetAt(room: string, spot: string): CabinetDef | undefined {
  return room === ARCADE_ROOM ? CABINETS.find((c) => c.spot === spot) : undefined;
}

/** The cabinet that plays a game (among `cabinets`, the arcade's by default). */
export function cabinetOf(game: ArcadeGame, cabinets: readonly CabinetDef[] = CABINETS): CabinetDef {
  return cabinets.find((c) => c.game === game)!;
}

// ---------- the games' clocks (the pages play by them, the room server checks by them) ----------

/** Hoot & Hop: lanes of traffic between the two kerbs. */
export const HOP_LANES = 5;
/** A hop's time in the air; the next hop waits for the landing. */
export const HOP_MS = 180;
/** Moon Flap: the night flight's speed and the distance between branches, in field pixels. */
export const FLAP_SPEED = 200;
export const FLAP_SPACING = 300;
/** How far ahead of the owl the first branch starts. */
export const FLAP_FIRST = 420;
/** Nest Knockdown: stacks in a run, shots for each, and the least time a shot takes (aim, flight, fall). */
export const KNOCK_LEVELS = 10;
export const KNOCK_SHOTS = 3;
export const KNOCK_SHOT_MS = 1200;

/** Points for a stack knocked down in so many shots: 3 for one shot, 2 for two, 1 for three. */
export function knockPoints(shots: number): number {
  return Math.max(0, KNOCK_SHOTS + 1 - shots);
}

// ---------- scores and feathers ----------

export interface GameRules {
  game: ArcadeGame;
  /** Visitor-facing. */
  name: string;
  /** The scores at which a run pays 1, 2, 3, 4, 5 and 6 feathers. */
  bands: readonly [number, number, number, number, number, number];
  /** The best score a run can reach, if there is one. */
  maxScore: number | null;
}

export const GAMES: Readonly<Record<ArcadeGame, GameRules>> = {
  crossing: { game: 'crossing', name: 'Hoot & Hop', bands: [1, 3, 5, 8, 12, 17], maxScore: null },
  flight: { game: 'flight', name: 'Moon Flap', bands: [2, 5, 10, 15, 25, 40], maxScore: null },
  sling: { game: 'sling', name: 'Nest Knockdown', bands: [2, 5, 9, 14, 20, 26], maxScore: KNOCK_LEVELS * knockPoints(1) },
};

/** Feathers for a run: 0 to 6, one for each band its score reaches. */
export function runFeathers(game: ArcadeGame, score: number): number {
  return GAMES[game].bands.filter((b) => score >= b).length;
}

/** On top, once a park day per game: the first run that beats the day's best on the wall. */
export const DAY_BEST_FEATHERS = 3;

/** What the page sends when a run is over. */
export interface RunResult {
  game: ArcadeGame;
  score: number;
  /** Nest Knockdown: every shot taken, the last stack's included. */
  shots?: number;
}

/** A run may last this long; one left open longer is forgotten. */
export const RUN_MAX_MS = 20 * 60_000;
/** Slack for the clocks: the page starts after the server and the answer has a trip to make. */
const RUN_SLACK_MS = 1000;

/** The least time a run with this result can have taken. */
export function leastRunMs(r: RunResult): number {
  switch (r.game) {
    case 'crossing':
      // Every crossing is a hop onto each lane and one onto the far kerb.
      return r.score * (HOP_LANES + 1) * HOP_MS;
    case 'flight':
      // The branches come at a steady pace: the first after FLAP_FIRST, then one every FLAP_SPACING.
      return r.score <= 0 ? 0 : ((FLAP_FIRST + (r.score - 1) * FLAP_SPACING) / FLAP_SPEED) * 1000;
    case 'sling':
      return (r.shots ?? 0) * KNOCK_SHOT_MS;
  }
}

/** Whether a result could be true for a run that took `elapsedMs` (the room server's clock). */
export function plausibleRun(r: RunResult, elapsedMs: number): boolean {
  if (!Number.isInteger(r.score) || r.score < 0) return false;
  const max = GAMES[r.game].maxScore;
  if (max !== null && r.score > max) return false;
  if (r.game === 'sling') {
    const shots = r.shots;
    if (shots === undefined || !Number.isInteger(shots) || shots < 0 || shots > KNOCK_LEVELS * KNOCK_SHOTS) return false;
    // Each stack knocked down took at least one shot and scored at most three points.
    if (r.score > shots * knockPoints(1)) return false;
  }
  return elapsedMs >= 0 && elapsedMs <= RUN_MAX_MS && elapsedMs + RUN_SLACK_MS >= leastRunMs(r);
}

// ---------- the score wall ----------

/** Owls on the wall for each game: today's best five. */
export const WALL_SIZE = 5;

/** An owl's colours and kind, for its portrait on the wall. Nothing else of its look, and no name anywhere. */
export type PortraitLook = Pick<OwlLook, 'body' | 'belly' | 'accent' | 'species'>;

export function portraitLook(look: OwlLook): PortraitLook {
  const out: PortraitLook = { body: look.body, belly: look.belly, accent: look.accent };
  if (look.species) out.species = look.species;
  return out;
}

export interface WallEntry {
  score: number;
  look: PortraitLook;
}

/** One game's column on the wall: today's best five, best first (the earlier of two equal scores first). */
export interface GameWall {
  game: ArcadeGame;
  top: WallEntry[];
}

/** A collector's own best today, per game (absent: no run yet today). */
export type OwnBests = Partial<Record<ArcadeGame, number>>;

/** What a finished run brought: its feathers (under the cap), the wall it changed, the owl's bests. */
export interface RunPaid {
  game: ArcadeGame;
  score: number;
  /** Feathers added (under the day's cap) and the balance after. */
  added: number;
  total: number;
  /** The run beat the owl's own best today. */
  best: boolean;
  /** The run beat the day's best on the wall (and earned DAY_BEST_FEATHERS, the first time today). */
  top: boolean;
  wall: GameWall;
  mine: OwnBests;
}

/**
 * The party game's minigames (OP-314): what each one is, and the one shape every minigame has. A
 * minigame's state is plain data the room server keeps; the server alone moves it on and says who won.
 * A page sends inputs (a tap, a hold, a place to fly to) and draws what the view it is sent shows.
 *
 * Every time here is in ms from the minigame's start (`t`), on the room server's clock: the server
 * stamps each input with when it came, so no page can say it pressed sooner than it did.
 */

export type MinigameId = 'updraft-race' | 'head-turn' | 'feather-fall' | 'perch-pairs' | 'branch-balance' | 'hoot-echo';

/** How the owls play it: each for itself, two teams, or one owl against the rest. */
export type MinigameKind = 'all' | 'team' | 'one-vs-rest';

/** One input from a page: what (`k`) and a small number (`v`), checked by the minigame's own rules. */
export interface MiniInput {
  k: MiniKey;
  v: number;
}
/** hold: 1 pressed, 0 let go; dir: -1 left, 0 straight, 1 right; x: where to fly to (0..1000); tap: which thing (a call, a hole, a branch). */
export type MiniKey = 'hold' | 'dir' | 'x' | 'tap';
export const MINI_KEYS: readonly MiniKey[] = ['hold', 'dir', 'x', 'tap'];

/** An input as it was taken: by whom, when (ms from the start) and what. */
export interface StampedInput extends MiniInput {
  seat: number;
  t: number;
}

/** Who plays: each owl's seat, and whether it is a bot (a park owl, or an owl whose visitor left). */
export interface MiniPlayer {
  seat: number;
  bot: boolean;
}

/** How a minigame came out: each seat's score, its place (1 the best), and for a team game the teams and which won (null: a draw). */
export interface MiniResult {
  scores: Record<number, number>;
  places: Record<number, number>;
  teams?: number[][];
  winningTeam?: number | null;
}

export interface MinigameDef<S = unknown> {
  id: MinigameId;
  /** Visitor-facing. */
  name: string;
  kind: MinigameKind;
  /** The longest it lasts (it may end sooner). */
  ms: number;
  /**
   * How pages follow it while it runs: `inputs`, each owl's inputs as they are taken (a page works out
   * the rest from its rules); `view`, the whole view again whenever it moves.
   */
  stream: 'inputs' | 'view';
  /** How to play, a short line each: on a phone, and on a computer. */
  how: { phone: string; keys: string };
  start(players: readonly MiniPlayer[], seed: number, round: number): S;
  /** An input from a seat at `t`: taken, or refused (false) when it makes no sense now. */
  input(s: S, seat: number, input: MiniInput, t: number): boolean;
  /** Move on to `t`: bots act, rounds turn. */
  tick(s: S, t: number): void;
  /** When it next needs a tick (ms from the start); null when only inputs move it until its end. */
  due(s: S, t: number): number | null;
  over(s: S, t: number): boolean;
  result(s: S): MiniResult;
  /** What a seat's page is shown (null: a page watching); hides what that seat must not see. */
  view(s: S, seat: number | null, t: number): unknown;
}

/** Places from scores, the highest first; owls on the same score share the better place. */
export function miniPlaces(scores: Record<number, number>, lowerWins = false): Record<number, number> {
  const seats = Object.keys(scores).map(Number);
  const val = (s: number) => (lowerWins ? -scores[s]! : scores[s]!);
  const out: Record<number, number> = {};
  for (const s of seats) out[s] = 1 + seats.filter((o) => val(o) > val(s)).length;
  return out;
}

/** Places from a team game: every owl on the winning team first, the rest second; a draw puts all first. */
export function teamPlaces(teams: readonly (readonly number[])[], winner: number | null): Record<number, number> {
  const out: Record<number, number> = {};
  teams.forEach((team, i) => team.forEach((seat) => (out[seat] = winner === null || winner === i ? 1 : 2)));
  return out;
}

/** Two teams from the seats in play: alternate seats, so two owls each with four, one against two with three. */
export function twoTeams(seats: readonly number[]): number[][] {
  const sorted = [...seats].sort((a, b) => a - b);
  return [sorted.filter((_, i) => i % 2 === 0), sorted.filter((_, i) => i % 2 === 1)];
}

/** Glowberries a minigame pays by place, each for itself: 1st 10, 2nd 6, 3rd 3, 4th 1. */
export const PLACE_BERRIES: readonly number[] = [10, 6, 3, 1];
/** In a team game: each owl on the winning team 8, the other team 2; a draw 5 each. */
export const TEAM_WIN_BERRIES = 8;
export const TEAM_LOSE_BERRIES = 2;
export const TEAM_DRAW_BERRIES = 5;

/** What each seat is paid in Glowberries for a minigame's result. */
export function miniBerries(kind: MinigameKind, r: MiniResult): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [seat, place] of Object.entries(r.places)) {
    if (kind === 'team') out[Number(seat)] = r.winningTeam === null ? TEAM_DRAW_BERRIES : place === 1 ? TEAM_WIN_BERRIES : TEAM_LOSE_BERRIES;
    else out[Number(seat)] = PLACE_BERRIES[place - 1] ?? PLACE_BERRIES.at(-1)!;
  }
  return out;
}

/** The seats that won a minigame: first place, unless a team game was a draw. */
export function miniWinners(kind: MinigameKind, r: MiniResult): number[] {
  if (kind === 'team' && r.winningTeam === null) return [];
  return Object.entries(r.places)
    .filter(([, p]) => p === 1)
    .map(([s]) => Number(s));
}

/** An input timeline's events for one seat, in order. */
export function inputsOf(inputs: readonly StampedInput[], seat: number, k?: MiniKey): StampedInput[] {
  return inputs.filter((i) => i.seat === seat && (k === undefined || i.k === k));
}

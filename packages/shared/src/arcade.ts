/**
 * The arcade: a room of its own off the market street's east end, with three game cabinets along
 * its back wall. Each cabinet is a spot in the room data (a door without `to`) and plays one game.
 * A cabinet whose game is not live yet shows an unlit screen reading "Hatching Soon" (one of the
 * approved closed-sign phrases), and standing at it says so; the games and their names come later.
 */
import { CLOSED_SIGNS } from '../rooms';

export const ARCADE_ROOM = 'arcade';

/** The three games, named for what you do in them (visitor-facing names come later). */
export type ArcadeGame = 'crossing' | 'flight' | 'sling';

export interface CabinetDef {
  /** The cabinet's spot in the arcade's room data. */
  spot: string;
  game: ArcadeGame;
  /** Whether its game is playable; a cabinet that is not shows "Hatching Soon". */
  live: boolean;
}

/** The cabinets from west to east: crossing the lanes, the night flight, the slingshot. */
export const CABINETS: readonly CabinetDef[] = [
  { spot: 'cabinet-crossing', game: 'crossing', live: false },
  { spot: 'cabinet-flight', game: 'flight', live: false },
  { spot: 'cabinet-sling', game: 'sling', live: false },
];

/** What a cabinet whose game is not live yet says, on its screen and to an owl standing at it. */
export const CABINET_OFF: (typeof CLOSED_SIGNS)[number] = 'Hatching Soon';

/** The cabinet at this spot of the arcade, if there is one. */
export function cabinetAt(room: string, spot: string): CabinetDef | undefined {
  return room === ARCADE_ROOM ? CABINETS.find((c) => c.spot === spot) : undefined;
}

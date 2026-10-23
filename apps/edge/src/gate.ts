/**
 * The park's front gate. Every visitor arrives in the lobby, where the ticket booth and the
 * turnstiles are. With GATE=open everyone may go on through; with GATE=ticket a pass that is not
 * admitted (no ticket) opens only the rooms outside the turnstiles: the lobby, so a visitor can still
 * reach the booth, and the street of nests with every owl's nest, which are free.
 */
import { LOBBY_ROOM, isFreeRoom } from '@owl-park/shared';
import type { PassPayload } from './pass';

/** The room every visitor may enter. */
export const LOBBY = LOBBY_ROOM;
/** Rooms outside the turnstiles, free to every pass: the lobby, the street of nests and the nests. */
export { isFreeRoom };

export type GateMode = 'open' | 'ticket';

export function gateMode(gate: string | undefined): GateMode {
  return gate === 'ticket' ? 'ticket' : 'open';
}

/** Whether a pass goes through the turnstiles (and so may use what is inside, like the shop). */
export function admitted(mode: GateMode, pass: Pick<PassPayload, 'adm'>): boolean {
  return mode === 'open' || pass.adm;
}

/** Whether a pass may join a room. */
export function mayEnter(mode: GateMode, pass: Pick<PassPayload, 'adm'>, roomId: string): boolean {
  return admitted(mode, pass) || isFreeRoom(roomId);
}

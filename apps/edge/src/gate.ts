/**
 * The park's front gate. Every visitor arrives in the lobby, where the ticket booth and the
 * turnstiles are. Open, everyone may go on through; taking tickets, a pass that is not admitted (no
 * ticket) opens only the rooms outside the turnstiles: the lobby, so a visitor can still reach the
 * booth, and the street of nests with every owl's nest, which are free.
 *
 * The keepers flip the gate with the opening switch (`gateSwitch.ts`, OP-067), no deploy needed;
 * GATE in wrangler.jsonc is only where it starts. An owl already in the park when the gate closes
 * stays in on the pass it had; the turnstiles apply the rule from then on.
 */
import { LOBBY_ROOM, isFreeRoom } from '@owl-park/shared';
import type { PassPayload } from './pass';

/** The room every visitor may enter. */
export const LOBBY = LOBBY_ROOM;
/** Rooms outside the turnstiles, free to every pass: the lobby, the street of nests and the nests. */
export { isFreeRoom };

export type GateMode = 'open' | 'ticket';

/** The gate as the park has it now: its mode, and when the switch last closed it (ms; null when it was deployed closed). */
export interface Gate {
  mode: GateMode;
  closedAt: number | null;
}

export function gateMode(gate: string | undefined): GateMode {
  return gate === 'ticket' ? 'ticket' : 'open';
}

/**
 * Whether a pass is inside the park (and so may use what is there, like the shop): the gate is
 * open, a ticket admitted it, or the owl was already in when the switch closed the gate.
 */
export function admitted(gate: GateMode | Gate, pass: Pick<PassPayload, 'adm' | 'iat'>): boolean {
  const g = typeof gate === 'string' ? { mode: gate, closedAt: null } : gate;
  if (g.mode === 'open' || pass.adm) return true;
  return g.closedAt !== null && pass.iat !== undefined && pass.iat * 1000 < g.closedAt;
}

/** Whether a pass may join a room. */
export function mayEnter(gate: GateMode | Gate, pass: Pick<PassPayload, 'adm' | 'iat'>, roomId: string): boolean {
  return admitted(gate, pass) || isFreeRoom(roomId);
}

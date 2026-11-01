/**
 * The park's front gate: the lobby, where the ticket booth and the turnstiles are (every visit
 * starts in the owl's own nest, outside them, OP-105). Open, everyone may go on through; taking
 * tickets, a pass that is not admitted (no ticket) opens only the rooms outside the turnstiles: the
 * lobby, so a visitor can still reach the booth, and the street of nests with every owl's nest,
 * which are free.
 *
 * The keepers flip the gate with the opening switch (`gateSwitch.ts`, OP-067), no deploy needed;
 * GATE in wrangler.jsonc is only where it starts. An owl already in the park when the gate closes
 * stays in on the pass it had; the turnstiles apply the rule from then on.
 *
 * Once a night the park restarts (OP-181) and sends every owl to the home screen. While the gate
 * takes tickets, no pass from before the last restart goes past the turnstiles: the owl walks
 * through them again, and they scan its ticket again (an expired one is refused there).
 */
import { LOBBY_ROOM, isFreeRoom } from '@owl-park/shared';
import type { PassPayload } from './pass';

/** The room every visitor may enter. */
export const LOBBY = LOBBY_ROOM;
/** Rooms outside the turnstiles, free to every pass: the lobby, the street of nests and the nests. */
export { isFreeRoom };

export type GateMode = 'open' | 'ticket';

/**
 * The gate as the park has it now: its mode, when the switch last closed it (ms; null when it was
 * deployed closed), and when the park last restarted for the night (ms; null before the first, OP-181).
 */
export interface Gate {
  mode: GateMode;
  closedAt: number | null;
  restartAt: number | null;
}

export function gateMode(gate: string | undefined): GateMode {
  return gate === 'ticket' ? 'ticket' : 'open';
}

const asGate = (gate: GateMode | Gate): Gate => (typeof gate === 'string' ? { mode: gate, closedAt: null, restartAt: null } : gate);

/**
 * Whether the gate takes tickets and this pass is from before the park's last nightly restart
 * (OP-181): such a pass opens nothing past the turnstiles. A pass made in the restart's own second
 * counts as before it (its time is in whole seconds): the owl only scans its ticket once more.
 */
export function beforeRestart(gate: GateMode | Gate, pass: Pick<PassPayload, 'iat'>): boolean {
  const g = asGate(gate);
  if (g.mode !== 'ticket' || g.restartAt === null) return false;
  return pass.iat === undefined || pass.iat * 1000 <= g.restartAt;
}

/**
 * Whether a pass is inside the park (and so may use what is there, like the shop): the gate is
 * open, a ticket admitted it, or the owl was already in when the switch closed the gate; never a
 * pass from before the last nightly restart while the gate takes tickets (OP-181).
 */
export function admitted(gate: GateMode | Gate, pass: Pick<PassPayload, 'adm' | 'iat'>): boolean {
  const g = asGate(gate);
  if (g.mode === 'open') return true;
  if (beforeRestart(g, pass)) return false;
  if (pass.adm) return true;
  return g.closedAt !== null && pass.iat !== undefined && pass.iat * 1000 < g.closedAt;
}

/** Whether a pass may join a room. */
export function mayEnter(gate: GateMode | Gate, pass: Pick<PassPayload, 'adm' | 'iat'>, roomId: string): boolean {
  return admitted(gate, pass) || isFreeRoom(roomId);
}

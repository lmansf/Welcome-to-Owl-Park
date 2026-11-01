/**
 * In through the turnstiles once a bought ticket has come (OP-190). A Day Ticket bought at the
 * turnstiles lands on the owl while it stands where they turned it back, just in front of them: the
 * owl then walks back into the turnstile it tried, by itself, and the turnstiles scan the ticket as
 * for any owl that walks in (its first scan, the ticket card, on into the hub). An owl that wandered
 * off is only told that the ticket works at the turnstiles; a ticket held for the store's check takes
 * no owl in until it works.
 */
import { LOBBY_ROOM, distanceToRect, type Rect, type Vec2 } from '@owl-park/shared';
import type { WalletEntry } from '../net';

/** How far from the turnstiles an owl still counts as at them (room pixels): they turn it back 70 below. */
export const AT_GATE_PX = 260;
/** How far inside the turnstiles' ends the owl's lane is kept, so the walk ends in a turnstile and not on its edge. */
const LANE_INSET_PX = 24;

export interface AdmitAsk {
  /** The room the owl is in. */
  room: string;
  /** Where it stands. */
  pos: Vec2;
  /** The turnstiles' doorway in that room, if it has them. */
  gate: Rect | null;
  /** The ticket that came: one held for the store's check takes no owl in. */
  status: WalletEntry['status'];
  /** The room is being left, or not built yet: no walk now. */
  busy: boolean;
}

/**
 * Where the owl walks to go through the turnstiles with the ticket that came: into the turnstile in
 * its own lane, at their middle. Null when it does not go in by itself: not in the lobby, too far from
 * the turnstiles, the ticket waits on the store's check (or does not work), or the room is busy.
 */
export function admitTarget(a: AdmitAsk): Vec2 | null {
  if (a.busy || a.room !== LOBBY_ROOM || !a.gate) return null;
  if (a.status !== 'unused' && a.status !== 'active') return null;
  if (distanceToRect(a.pos, a.gate) > AT_GATE_PX) return null;
  const g = a.gate;
  const inset = Math.min(LANE_INSET_PX, g.w / 2);
  return { x: Math.min(g.x + g.w - inset, Math.max(g.x + inset, a.pos.x)), y: g.y + g.h / 2 };
}

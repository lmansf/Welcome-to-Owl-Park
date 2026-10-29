/**
 * Copies of a room (OP-075): on a night busier than one room holds, the keepers open a second copy
 * of it (the same painting, NPC owls and leaf piles, its own owls and cap) with the admin key and no
 * deploy. Each copy is a room object of its own, so copies exist only with one object per room
 * (ROOM_SHARDING=room); with the whole park in one object a copy would add no room to breathe.
 *
 * The page asks for a room by its id as always; the Worker sends it to the copy with the most free
 * places among the room itself (copy 1) and its open copies. A draining copy takes no new owls, but
 * an owl whose socket dropped goes back to the copy it was in while that copy is still there. Inside
 * its object a copy is simply its room: quests, NPC owls and activities see the room's own id.
 */
import { COPY_MAX, type Copies, type CopyState } from '@owl-park/shared';

/** The object a room's copy lives in, with one object per room: copy 1 is the room's own. */
export function copyObjectName(room: string, copy: number): string {
  return copy > 1 ? `room:${room}~${copy}` : `room:${room}`;
}

/**
 * Every room object there is now: the park's one (`single`), or each room's own and its copies'
 * (`room`). Nests are not among them: with one object per room each nest is an object of its own,
 * made when an owl first walks in.
 */
export function roomObjectNames(sharding: string | undefined, rooms: readonly string[], copies: Copies): string[] {
  if (sharding !== 'room') return ['park'];
  const names: string[] = [];
  for (const room of rooms) {
    names.push(copyObjectName(room, 1));
    const { open, draining } = copiesIn(copies, room);
    for (const n of [...open, ...draining]) names.push(copyObjectName(room, n));
  }
  return names;
}

/** A room's copies beside itself, by state, in copy order. */
export function copiesIn(copies: Copies, room: string): { open: number[]; draining: number[] } {
  const open: number[] = [];
  const draining: number[] = [];
  const of = Object.hasOwn(copies, room) ? copies[room]! : {};
  for (const [k, state] of Object.entries(of)) {
    const n = Number(k);
    if (!Number.isInteger(n) || n < 2 || n > COPY_MAX) continue;
    (state === 'draining' ? draining : open).push(n);
  }
  return { open: open.sort((a, b) => a - b), draining: draining.sort((a, b) => a - b) };
}

/**
 * The copy a newcomer to `room` goes to: the one it was in (`sticky`), while that copy is still
 * there and has a place; otherwise the room itself or an open copy, whichever has the most free
 * places (the lowest number on a tie). When all are full it is the emptiest, which turns it away.
 */
export function pickCopy(open: readonly number[], draining: readonly number[], counts: Readonly<Record<number, number>>, cap: number, sticky: number | null): number {
  const count = (n: number) => counts[n] ?? 0;
  if (sticky !== null && (sticky === 1 || open.includes(sticky) || draining.includes(sticky)) && count(sticky) < cap) return sticky;
  let best = 1;
  for (const n of open) if (count(n) < count(best)) best = n;
  return best;
}

/** The copies with one changed: opened, draining, or closed (gone from routing). Copy 1 is the room itself and stays. */
export function withCopy(copies: Copies, room: string, n: number, state: CopyState | 'closed'): Copies {
  const out: Copies = {};
  for (const [r, of] of Object.entries(copies)) out[r] = { ...of };
  const of = out[room] ?? {};
  if (state === 'closed') delete of[String(n)];
  else of[String(n)] = state;
  if (Object.keys(of).length) out[room] = of;
  else delete out[room];
  return out;
}

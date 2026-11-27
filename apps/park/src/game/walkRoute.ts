import { doorTarget, isNestRoom, type WalkMap } from '@owl-park/shared';
import { roomFor, roomOnMap } from '../rooms';

/**
 * Walk there from the Menu's map (OP-513, making OP-385 effective): the way on foot from the room the owl
 * stands in to a place, room by room through the doorways, by the fewest doorways. Pure, so the browser
 * and the unit tests share it; the room scene says which room each doorway leads to.
 */

/** A doorway of a room, as the route needs it: its id and the room it leads to (undefined: nowhere just now). */
export interface RouteDoor {
  id: string;
  to: string | undefined;
}

/** The most rooms a route looks through: the park has a few hundred, and a walk there is a few rooms long. */
export const ROUTE_MOST_ROOMS = 400;

/**
 * The doorways, one per room, from `from` to `to` by the fewest doorways, as [room, door] pairs in the
 * order the owl takes them; [] when already there, null when no way on foot reaches it.
 */
export function walkRoute(from: string, to: string, doorsOf: (room: string) => readonly RouteDoor[]): Array<[string, string]> | null {
  if (from === to) return [];
  const came = new Map<string, [string, string]>();
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length && seen.size <= ROUTE_MOST_ROOMS) {
    const room = queue.shift()!;
    for (const door of doorsOf(room)) {
      const next = door.to;
      if (next === undefined || seen.has(next)) continue;
      seen.add(next);
      came.set(next, [room, door.id]);
      if (next === to) {
        const way: Array<[string, string]> = [];
        for (let at = to; at !== from; ) {
          const step = came.get(at)!;
          way.unshift(step);
          at = step[0];
        }
        return way;
      }
      queue.push(next);
    }
  }
  return null;
}

/** The doorway of `from` that starts the way on foot to `to`: null when already there or no way reaches it. */
export function firstDoor(from: string, to: string, doorsOf: (room: string) => readonly RouteDoor[]): string | null {
  return walkRoute(from, to, doorsOf)?.[0]?.[1] ?? null;
}

/** A walk there under way (kept across rooms): the place asked for, the room it lands in, and the room the next doorway leads to. */
export interface Lead {
  place: string;
  room: string;
  next: string | null;
}

/**
 * What a walk there does in a room the owl has just come into: 'arrived' in the place's room, 'lost' when
 * the owl came in anywhere but where the walk was leading (it went its own way, so the walk ends), else 'on'.
 */
export function leadIn(lead: Lead, room: string): 'arrived' | 'lost' | 'on' {
  if (room === lead.room) return 'arrived';
  return lead.next !== null && room !== lead.next ? 'lost' : 'on';
}

/**
 * The doorways of a room on the park an owl walks, for walkRoute: each to the room it leads to, or
 * undefined where it leads nowhere or into a realm not open. A nest's doorways lead nowhere here: the
 * walk there never goes through one (travel home does that).
 */
export function mapDoorsOf(walking: WalkMap, closed: (room: string) => boolean = () => false): (room: string) => RouteDoor[] {
  return (room) => {
    const def = roomFor(room);
    if (!def || isNestRoom(room)) return [];
    return roomOnMap(def, walking).doors.map((d) => {
      const to = doorTarget(d, walking)?.room;
      return { id: d.id, to: to !== undefined && roomFor(to) && !isNestRoom(to) && !closed(to) ? to : undefined };
    });
  };
}

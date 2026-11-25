/**
 * What the park says when an action needs the room server and the park could not connect (OP-406,
 * OP-407): one line for every such action, so a press never does nothing and says nothing.
 */
export const ROOM_DOWN = 'That needs the park, and it could not connect just now. Try again in a moment.';

/**
 * Whether a link to the room server can carry a press now: there is one (the local park has none), and
 * it does not say its socket is down (OP-434: feather tag's Start sent into a dropped line said nothing).
 */
export function roomReachable(link: { online?(): boolean } | null | undefined): boolean {
  return !!link && link.online?.() !== false;
}

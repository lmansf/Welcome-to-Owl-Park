/**
 * The vote desk in the Great Hollow (OP-288; behind `?desk=1`, flags.ts): a small board on the hall's
 * floor that shows how this month's Realm Vote stands, each realm's share in whole percents. It never
 * shows a count (the owner's call: percentages only), and it moves the moment any owl votes, because
 * the room server tells every owl in the hall the new shares (a `shares` frame).
 *
 * This file is the rules, with nothing of the browser in it, so it is unit-tested: where the desk
 * stands, and the lines it shows. voteDeskView.ts draws it.
 */
import { type Vec2, VOTABLE_REALMS, placeName } from '@owl-park/shared';
import { HALL_MIDDLE, HALL_ROOM, RUN_Y } from '@owl-park/shared/rooms';

/** The room it stands in. */
export const VOTE_DESK_ROOM = HALL_ROOM.id;

/**
 * The desk as it stands: its foot on the floor (the middle of its front edge, its depth among the owls)
 * and the size of its board. It stands on the front half of the floor, a few strides west of where owls
 * arrive in the middle and in front of the guardian, so an owl sees it as it comes in: off the heart's
 * rising air, the moonbeams, the leaf piles and the quest spots, clear of the guardian's picture, the
 * root runs and the doorways (voteDesk.test.ts holds it there).
 */
export const VOTE_DESK = {
  at: { x: HALL_MIDDLE - 380, y: RUN_Y + 412 } as Vec2,
  w: 260,
  h: 176,
} as const;

/** The board's box in the room, standing up from its foot. */
export function deskBox(): { x: number; y: number; w: number; h: number } {
  return { x: VOTE_DESK.at.x - VOTE_DESK.w / 2, y: VOTE_DESK.at.y - VOTE_DESK.h, w: VOTE_DESK.w, h: VOTE_DESK.h };
}

/** The desk's words. */
export const DESK_WORDS = {
  title: 'Realm Vote',
  sub: 'This month so far',
  empty: 'No votes yet this month.',
  call: 'Vote at a realm’s idol.',
} as const;

export interface DeskRow {
  realm: string;
  /** The realm's place, as the park names it to visitors (npcs.ts PLACE_NAMES), with a capital. */
  name: string;
  /** Its share of this month's votes, in whole percents. */
  pct: number;
}

/** What the desk shows: a row per realm in the vote, in the vote's order, or none when nobody has voted. */
export function deskRows(shares: Readonly<Record<string, number>> | null): DeskRow[] {
  if (!shares || Object.keys(shares).length === 0) return [];
  return VOTABLE_REALMS.map((realm) => {
    const name = placeName(realm);
    return { realm, name: name.charAt(0).toUpperCase() + name.slice(1), pct: Math.max(0, Math.min(100, Math.round(shares[realm] ?? 0))) };
  });
}

/** The desk's lines as words (what a test or a screen reader reads): its title, then each row or the empty line. */
export function deskLines(shares: Readonly<Record<string, number>> | null): string[] {
  const rows = deskRows(shares);
  return [
    DESK_WORDS.title,
    DESK_WORDS.sub,
    ...(rows.length ? rows.map((r) => `${r.name} ${r.pct}%`) : [DESK_WORDS.empty]),
    DESK_WORDS.call,
  ];
}

/** The desk as a test sees it (RoomScene.debugState): where it stands and the words it shows. */
export interface DeskState {
  at: Vec2;
  month: string | null;
  shares: Record<string, number> | null;
  lines: string[];
}

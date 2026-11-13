/**
 * Bring a friend (OP-056, OP-311, OP-312). An owl tells a friend its four-letter friend code (OP-139);
 * the friend types it in the Menu. A friend who has never had a ticket is given a free Day Ticket to
 * come in with. When the friend first goes through the front gate with any ticket, the owl that
 * invited them is thanked: a free Day Ticket of its own, or REFERRAL_MEMBER_FEATHERS feathers for an
 * owl with an annual pass. There is no cap on thank-yous (Logan, Nov 10): an owl is thanked for every
 * friend it brings. What keeps it fair is the friend's side: each friend's free Day Ticket is tied to the
 * email on its order, and an email that has had a friend's free Day Ticket never gets another.
 *
 * The free Day Tickets go through the store's $0 order (a discount code that takes the whole Day
 * Ticket off), carried by a checkout the park opened for that owl: an order with the code and no
 * such checkout waits for the keepers' check instead of going out, and so does a friend's order whose
 * email already had one (or whose email the store will not say).
 *
 * 500 feathers is one epic shop item (SHOP_PRICES.epic), a little more than a month's quest
 * (MONTHLY_QUEST_FEATHERS, 450): a real thank-you that never outruns playing.
 */

/** The thank-you to an owl with an annual pass, in feathers, in place of a Day Ticket. */
export const REFERRAL_MEMBER_FEATHERS = 500;
/** How long a free Day Ticket offer waits to be taken. */
export const REFERRAL_OFFER_MS = 30 * 24 * 3600_000;
/** Friend codes typed from one address in a day, whoever types them: a household or a classroom shares one. */
export const REFERRAL_INVITES_PER_IP_PER_DAY = 20;

/** Why a friend code typed in was not taken. */
export type ReferralRefusal =
  /** No owl has that code. */
  | 'unknown-code'
  /** The owl's own code. */
  | 'self'
  /** The owl with that code is on this same screen. */
  | 'same-device'
  /** The same email protects both owls. */
  | 'same-email'
  /** This owl has had a ticket: bringing a friend is for owls new to the park. */
  | 'has-ticket'
  /** This owl was already brought by a friend. */
  | 'already-invited'
  /** Too many codes typed from here today. */
  | 'too-many';

/** A free Day Ticket waiting to be taken: for coming in as a friend, or as a thank-you. */
export interface ReferralOffer {
  id: string;
  kind: 'friend' | 'reward';
  expires: number;
}

/** What an owl's Menu shows of bringing friends. */
export interface ReferralView {
  /** The owl's friend code, to tell a friend. */
  code: string;
  /** Whether a friend's code brought this owl (then it can type no other). */
  invited: boolean;
  /** Whether this owl may still type a friend's code (never had a ticket, not invited yet). */
  canEnterCode: boolean;
  /** Free Day Tickets waiting, soonest to run out first. */
  offers: ReferralOffer[];
  /** Friends who came in and thanked this owl, ever. */
  thanked: number;
}

/** What a thanked friend's first scan gave the owl that brought them. */
export type ReferralReward = 'ticket' | 'feathers';

/** Mail hosts that ignore dots in the name part (an address with or without them reaches one inbox). */
const DOTLESS_HOSTS: Readonly<Record<string, string>> = { 'gmail.com': 'gmail.com', 'googlemail.com': 'gmail.com' };

/**
 * An email as the one-free-ticket-per-friend check counts it, so one inbox is one friend: lowercased,
 * with any +tag dropped (name+anything@host reaches name@host on most mail hosts), and for Gmail the
 * dots dropped and googlemail.com read as gmail.com. Only for that check: the accounts keep the email
 * as typed. Null for anything that is not one email.
 */
export function referralEmailKey(email: string | null | undefined): string | null {
  const e = (email ?? '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at <= 0 || at === e.length - 1 || /\s/.test(e)) return null;
  let name = e.slice(0, at);
  let host = e.slice(at + 1);
  const plus = name.indexOf('+');
  if (plus >= 0) name = name.slice(0, plus);
  const dotless = DOTLESS_HOSTS[host];
  if (dotless) {
    host = dotless;
    name = name.replace(/\./g, '');
  }
  return name ? `${name}@${host}` : null;
}

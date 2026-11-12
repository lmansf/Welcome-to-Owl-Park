/**
 * Bring a friend (OP-056, OP-311, OP-312), in the Collections object's SQLite beside the owls'
 * accounts: which owl brought which friend, the free Day Tickets waiting to be taken, and the store
 * checkouts each one went to. The rules are in packages/shared/src/referrals.ts; the Worker decides
 * what the ticket book says (whether the friend ever had a ticket, whether the owl thanked holds an
 * annual pass) and passes it in. Written without platform APIs beyond `SqlStorage`, so Node tests it.
 *
 * - An invite names the friend once: a friend is brought by one owl, ever, and only while new.
 * - A free Day Ticket is an offer good for REFERRAL_OFFER_MS; a store checkout opened for it is kept
 *   by its token's hash, and the first paid order through any of them spends the offer.
 * - A friend's free Day Ticket is tied to its order's email (kept as the accounts' keyed hash): an email
 *   that has had one never spends another friend's offer. A thank-you ticket is the owl's own and has no
 *   such limit (Logan, Nov 10: no cap on thank-yous, one free ticket per friend's email).
 * - The friend's first time through the gate thanks the owl that brought them, once.
 */
import {
  REFERRAL_INVITES_PER_IP_PER_DAY,
  REFERRAL_MEMBER_FEATHERS,
  REFERRAL_OFFER_MS,
  type ReferralOffer,
  type ReferralRefusal,
  type ReferralReward,
  type ReferralView,
} from '@owl-park/shared';

const DAY_MS = 24 * 3600_000;

/** One owl as an invite sees it: who it is, the screen it is on, the email protecting it. */
export interface InviteOwl {
  cid: string;
  device: string | null;
  emailHash: string | null;
}

export type InviteResult = { ok: true; offer: ReferralOffer; referrer: string } | { ok: false; reason: ReferralRefusal };

/** A thank-you given: to whom, and what. */
export interface Credited {
  referrer: string;
  reward: ReferralReward;
}

export class ReferralBook {
  constructor(
    private readonly sql: SqlStorage,
    private readonly newId: () => string,
  ) {
    sql.exec(
      `CREATE TABLE IF NOT EXISTS referrals (
        friend_cid TEXT PRIMARY KEY,
        referrer_cid TEXT NOT NULL,
        at INTEGER NOT NULL,
        ip_hash TEXT NOT NULL,
        state TEXT NOT NULL,
        reward TEXT,
        rewarded_at INTEGER
      )`,
    );
    sql.exec('CREATE INDEX IF NOT EXISTS referrals_by_referrer ON referrals (referrer_cid, rewarded_at)');
    sql.exec('CREATE INDEX IF NOT EXISTS referrals_by_ip ON referrals (ip_hash, at)');
    sql.exec(
      `CREATE TABLE IF NOT EXISTS referral_offers (
        id TEXT PRIMARY KEY,
        cid TEXT NOT NULL,
        kind TEXT NOT NULL,
        created INTEGER NOT NULL,
        expires INTEGER NOT NULL,
        used_order TEXT,
        used_at INTEGER
      )`,
    );
    sql.exec('CREATE INDEX IF NOT EXISTS referral_offers_by_cid ON referral_offers (cid, expires)');
    sql.exec('CREATE TABLE IF NOT EXISTS referral_checkouts (hash TEXT PRIMARY KEY, offer_id TEXT NOT NULL, at INTEGER NOT NULL)');
    // The emails (keyed hashes) that have had a friend's free Day Ticket, and the order that spent it.
    sql.exec('CREATE TABLE IF NOT EXISTS referral_emails (email_hash TEXT PRIMARY KEY, order_id TEXT NOT NULL, at INTEGER NOT NULL)');
  }

  private rowOf(friend: string): Record<string, unknown> | undefined {
    return this.sql.exec('SELECT * FROM referrals WHERE friend_cid = ?', friend).toArray()[0] as Record<string, unknown> | undefined;
  }

  private newOffer(cid: string, kind: ReferralOffer['kind'], now: number): ReferralOffer {
    const offer = { id: this.newId(), kind, expires: now + REFERRAL_OFFER_MS };
    this.sql.exec('INSERT INTO referral_offers (id, cid, kind, created, expires) VALUES (?, ?, ?, ?, ?)', offer.id, cid, kind, now, offer.expires);
    return offer;
  }

  /** The owl's offers still waiting, the one that runs out soonest first. */
  offers(cid: string, now: number): ReferralOffer[] {
    return this.sql
      .exec('SELECT id, kind, expires FROM referral_offers WHERE cid = ? AND used_order IS NULL AND expires > ? ORDER BY expires, id', cid, now)
      .toArray()
      .map((r) => ({ id: String(r['id']), kind: r['kind'] === 'reward' ? 'reward' : 'friend', expires: Number(r['expires']) }));
  }

  /** What the owl's Menu shows; `code` is its friend code and `hadTicket` whether the ticket book has had one on it. */
  view(cid: string, code: string, hadTicket: boolean, now: number): ReferralView {
    const invited = this.rowOf(cid) !== undefined;
    const thanked = Number((this.sql.exec("SELECT COUNT(*) AS n FROM referrals WHERE referrer_cid = ? AND state = 'rewarded'", cid).toArray()[0] as { n: number }).n);
    return { code, invited, canEnterCode: !invited && !hadTicket, offers: this.offers(cid, now), thanked };
  }

  /**
   * A friend typed an owl's code. Taken only for a new owl (never had a ticket, never brought before)
   * and a different owl (not itself, not on its screen, not protected by its email), at most
   * REFERRAL_INVITES_PER_IP_PER_DAY from one address a day. Taken, the friend is offered a free Day Ticket.
   */
  invite(friend: InviteOwl, referrer: InviteOwl | null, hadTicket: boolean, ipHash: string, now: number): InviteResult {
    if (!referrer) return { ok: false, reason: 'unknown-code' };
    if (referrer.cid === friend.cid) return { ok: false, reason: 'self' };
    if (referrer.device !== null && referrer.device === friend.device) return { ok: false, reason: 'same-device' };
    if (referrer.emailHash !== null && referrer.emailHash === friend.emailHash) return { ok: false, reason: 'same-email' };
    if (this.rowOf(friend.cid)) return { ok: false, reason: 'already-invited' };
    if (hadTicket) return { ok: false, reason: 'has-ticket' };
    const today = Number((this.sql.exec('SELECT COUNT(*) AS n FROM referrals WHERE ip_hash = ? AND at > ?', ipHash, now - DAY_MS).toArray()[0] as { n: number }).n);
    if (today >= REFERRAL_INVITES_PER_IP_PER_DAY) return { ok: false, reason: 'too-many' };
    this.sql.exec("INSERT INTO referrals (friend_cid, referrer_cid, at, ip_hash, state) VALUES (?, ?, ?, ?, 'invited')", friend.cid, referrer.cid, now, ipHash);
    return { ok: true, offer: this.newOffer(friend.cid, 'friend', now), referrer: referrer.cid };
  }

  /** A store checkout opened for one of the owl's offers (the one that runs out soonest), by its token's hash; the offer, or null for none. */
  checkout(cid: string, tokenHash: string, now: number): ReferralOffer | null {
    const offer = this.offers(cid, now)[0];
    if (!offer) return null;
    this.sql.exec('INSERT OR REPLACE INTO referral_checkouts (hash, offer_id, at) VALUES (?, ?, ?)', tokenHash, offer.id, now);
    return offer;
  }

  /**
   * A paid order with the free Day Ticket's code came through a checkout (its token's hash): whether
   * that checkout was opened for an offer still waiting, which this order now spends. A friend's offer
   * is spent only by an order whose email (`emailHash`, null when the store will not say) has never had
   * a friend's free Day Ticket. The same order again (the store repeats webhooks) is still yes; any
   * other order through a spent offer is no.
   */
  spend(tokenHash: string, order: string, emailHash: string | null, now: number): boolean {
    const c = this.sql.exec('SELECT offer_id FROM referral_checkouts WHERE hash = ?', tokenHash).toArray()[0] as { offer_id: string } | undefined;
    if (!c) return false;
    const o = this.sql.exec('SELECT kind, used_order, expires FROM referral_offers WHERE id = ?', c.offer_id).toArray()[0] as { kind: string; used_order: string | null; expires: number } | undefined;
    if (!o) return false;
    if (o.used_order !== null) return o.used_order === order;
    if (Number(o.expires) <= now) return false;
    if (o.kind !== 'reward') {
      if (emailHash === null) return false;
      const had = this.sql.exec('SELECT order_id FROM referral_emails WHERE email_hash = ?', emailHash).toArray()[0] as { order_id: string } | undefined;
      if (had && had.order_id !== order) return false;
      if (!had) this.sql.exec('INSERT INTO referral_emails (email_hash, order_id, at) VALUES (?, ?, ?)', emailHash, order, now);
    }
    this.sql.exec('UPDATE referral_offers SET used_order = ?, used_at = ? WHERE id = ?', order, now, c.offer_id);
    return true;
  }

  /** The owl that brought this friend and has not been thanked for them yet; null for none. */
  pending(friend: string): string | null {
    const r = this.rowOf(friend);
    return r && r['state'] === 'invited' ? String(r['referrer_cid']) : null;
  }

  /**
   * The friend went through the gate for the first time: the owl that brought them is thanked, once.
   * `member` (it holds an annual pass) gets REFERRAL_MEMBER_FEATHERS by `addFeathers`; any other owl a
   * free Day Ticket offer, however many friends it has brought. Two owls of one email (`sameEmail`, as
   * the accounts say now) are never thanked. Null when there is nothing to give.
   */
  credit(friend: string, member: boolean, sameEmail: boolean, addFeathers: (cid: string, n: number) => void, now: number): Credited | null {
    const referrer = this.pending(friend);
    if (!referrer) return null;
    if (sameEmail) {
      this.sql.exec("UPDATE referrals SET state = 'refused' WHERE friend_cid = ?", friend);
      return null;
    }
    const reward: ReferralReward = member ? 'feathers' : 'ticket';
    this.sql.exec("UPDATE referrals SET state = 'rewarded', reward = ?, rewarded_at = ? WHERE friend_cid = ?", reward, now, friend);
    if (member) addFeathers(referrer, REFERRAL_MEMBER_FEATHERS);
    else this.newOffer(referrer, 'reward', now);
    return { referrer, reward };
  }
}

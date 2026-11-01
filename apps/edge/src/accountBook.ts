/**
 * Owls' accounts (OP-139), in the Collections object's SQLite beside their collections. For each owl
 * (its collector id): its friend code; the email that protects it, as a keyed hash to find it by and
 * a sealed copy to write to, never the address itself; the device it is on; and its look, for the
 * pictures a restoring screen shows. Beside them the magic links sent, each good once until it runs
 * out, and when links went out, to limit how many do. The hash and the seal are made by the Worker
 * (accounts.ts), which alone holds their key; the calls at the end are what the Worker's account
 * routes ask of the collections object. Written without platform APIs beyond `SqlStorage`, so Node
 * tests it.
 *
 * A ticket's order email (OP-186) is kept nowhere here until its buyer says so: the owl that took the
 * ticket is offered a one-tap protect link whose row names the owl and nothing about the email (the
 * address travels sealed in the link itself), and only opening it protects the owl as the Menu's does.
 */
import { moduleLog } from './logs';
import { LINKS_PER_EMAIL_PER_HOUR, LINKS_PER_IP_PER_HOUR, MAGIC_LINK_MS, ORDER_LINK_MS, friendCodeFrom, isLook, portraitLook, type OwlAccount, type OwlPicture, type PortraitLook } from '@owl-park/shared';

const HOUR_MS = 3600_000;
/** Spent and lapsed links are kept this long (for a keeper's question), then dropped. */
const LINKS_KEPT_MS = 24 * HOUR_MS;

export type LinkKind = 'protect' | 'restore';

export interface Account {
  cid: string;
  friendCode: string;
  /** An email protects the owl. */
  protected: boolean;
  /** The device the owl is on (null: none yet). */
  device: string | null;
  /** Its colours and kind as its screen last showed them, for the picture a restoring screen shows. */
  look: PortraitLook | null;
}

export interface LinkRow {
  kind: LinkKind;
  /** The owl a protect link protects. */
  cid: string | null;
  /** The email's hash; empty for a ticket's protect link (OP-186), which carries its email itself. */
  emailHash: string;
  /** A protect link's sealed email, kept by the owl once it is confirmed (none for a ticket's). */
  emailSeal: string | null;
}

/** The email a ticket's protect link carries (OP-186), read back from it by the Worker: its hash and its seal. */
export interface CarriedEmail {
  emailHash: string;
  emailSeal: string;
}

/** Where a device stands with its owl: the device it holds it on (`dev`), or moved (another screen has it). */
export type DeviceStand = { dev: string } | 'moved';

/** What a confirmed protect link answers: the owl now protected. */
export interface Protected {
  cid: string;
  account: OwlAccount;
  look: PortraitLook | null;
}

/** A restore link used: the owl it brought, on this device, and whether it moved here (or was here already). */
export interface Restored {
  cid: string;
  dev: string;
  moved: boolean;
}

/** What a page is told of its owl's account. */
export const accountView = (a: Account): OwlAccount => ({ friendCode: a.friendCode, protected: a.protected });

export class AccountBook {
  constructor(
    private readonly sql: SqlStorage,
    private readonly random: (n: number) => Uint8Array,
  ) {
    sql.exec(
      `CREATE TABLE IF NOT EXISTS owl_accounts (
        cid TEXT PRIMARY KEY,
        friend_code TEXT NOT NULL UNIQUE,
        email_hash TEXT,
        email_seal TEXT,
        protected_at INTEGER,
        device TEXT,
        bound_at INTEGER,
        look TEXT,
        created_at INTEGER NOT NULL
      )`,
    );
    sql.exec('CREATE INDEX IF NOT EXISTS owl_accounts_by_email ON owl_accounts (email_hash)');
    sql.exec(
      `CREATE TABLE IF NOT EXISTS account_links (
        nonce TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        cid TEXT,
        email_hash TEXT NOT NULL,
        email_seal TEXT,
        exp INTEGER NOT NULL,
        used_at INTEGER
      )`,
    );
    sql.exec('CREATE TABLE IF NOT EXISTS account_sends (key TEXT NOT NULL, at INTEGER NOT NULL)');
    sql.exec('CREATE INDEX IF NOT EXISTS account_sends_by_key ON account_sends (key, at)');
    // The owls a ticket's order offered a protect link (OP-186), so a claim made again mails no second one:
    // the order's keyed hash and the owl, nothing of the email.
    sql.exec('CREATE TABLE IF NOT EXISTS account_order_offers (order_hash TEXT NOT NULL, cid TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (order_hash, cid))');
  }

  private row(cid: string): Record<string, unknown> | undefined {
    return this.sql.exec('SELECT * FROM owl_accounts WHERE cid = ?', cid).toArray()[0] as Record<string, unknown> | undefined;
  }

  private static of(r: Record<string, unknown>): Account {
    let look: PortraitLook | null = null;
    try {
      const parsed = r['look'] ? (JSON.parse(String(r['look'])) as unknown) : null;
      look = isLook(parsed) ? portraitLook(parsed) : null;
    } catch (e) {
      moduleLog.error('worker.accounts', 'read_failed', 'An account’s stored picture could not be read: it shows none.', { error: e });
      look = null;
    }
    return { cid: String(r['cid']), friendCode: String(r['friend_code']), protected: r['email_hash'] !== null && r['email_hash'] !== undefined, device: (r['device'] as string | null) ?? null, look };
  }

  /** The owl's account, made the first time it is asked for, with a friend code no other owl has. */
  account(cid: string, now: number): Account {
    const have = this.row(cid);
    if (have) return AccountBook.of(have);
    for (let tries = 0; tries < 32; tries++) {
      const code = friendCodeFrom(this.random(16));
      if (!code) continue;
      if (this.sql.exec('SELECT 1 FROM owl_accounts WHERE friend_code = ?', code).toArray().length) continue;
      this.sql.exec('INSERT INTO owl_accounts (cid, friend_code, created_at) VALUES (?, ?, ?)', cid, code, now);
      return AccountBook.of(this.row(cid)!);
    }
    throw new Error('no friend code left to give');
  }

  /**
   * Which device holds the owl, as a page's collector token names `dev` (null: a token from before
   * devices). The first device to ask holds it. A token from before devices holds it too while it was
   * never restored on another screen (several tabs of one browser upgrade together); after that only
   * the device it was restored on does, and any other finds it moved.
   */
  stand(cid: string, dev: string | null, newDevice: () => string, now: number): DeviceStand {
    const a = this.account(cid, now);
    if (a.device === null) {
      const d = dev ?? newDevice();
      this.sql.exec('UPDATE owl_accounts SET device = ? WHERE cid = ?', d, cid);
      return { dev: d };
    }
    if (dev === a.device) return { dev };
    if (dev === null && this.row(cid)!['bound_at'] === null) return { dev: a.device };
    return 'moved';
  }

  /** Whether a page on this device (null: a token from before devices) still holds the owl, by the rule above; changes nothing. */
  holds(cid: string, dev: string | null): boolean {
    const r = this.row(cid);
    if (!r || r['device'] === null) return true;
    return dev !== null ? r['device'] === dev : r['bound_at'] === null;
  }

  /** The owl's colours and kind as its screen shows them now, for its picture (written only when they changed). */
  setLook(cid: string, look: PortraitLook, now: number): void {
    this.account(cid, now);
    const keep = JSON.stringify(portraitLook(look));
    this.sql.exec('UPDATE owl_accounts SET look = ? WHERE cid = ? AND look IS NOT ?', keep, cid, keep);
  }

  /**
   * Whether a link may go out to this email (by its hash), asked for from this address (by its hash):
   * at most LINKS_PER_EMAIL_PER_HOUR to one email and LINKS_PER_IP_PER_HOUR from one address in an
   * hour. A link allowed is counted against both.
   */
  maySend(emailHash: string, ipHash: string, now: number): boolean {
    this.sql.exec('DELETE FROM account_sends WHERE at <= ?', now - HOUR_MS);
    const sent = (key: string) => Number((this.sql.exec('SELECT COUNT(*) AS n FROM account_sends WHERE key = ?', key).toArray()[0] as { n: number }).n);
    if (sent(`e:${emailHash}`) >= LINKS_PER_EMAIL_PER_HOUR || sent(`i:${ipHash}`) >= LINKS_PER_IP_PER_HOUR) return false;
    this.sql.exec('INSERT INTO account_sends (key, at) VALUES (?, ?), (?, ?)', `e:${emailHash}`, now, `i:${ipHash}`, now);
    return true;
  }

  /** A link sent: good once, for MAGIC_LINK_MS (or `ttl`). Its expiry (ms). */
  noteLink(nonce: string, kind: LinkKind, link: Omit<LinkRow, 'kind'>, now: number, ttl = MAGIC_LINK_MS): number {
    this.sql.exec('DELETE FROM account_links WHERE exp <= ?', now - LINKS_KEPT_MS);
    const exp = now + ttl;
    this.sql.exec('INSERT INTO account_links (nonce, kind, cid, email_hash, email_seal, exp) VALUES (?, ?, ?, ?, ?, ?)', nonce, kind, link.cid, link.emailHash, link.emailSeal, exp);
    return exp;
  }

  /** A link that is still good (never used, not run out): what it is for, without using it. */
  peekLink(nonce: string, kind: LinkKind, now: number): LinkRow | null {
    const r = this.sql.exec('SELECT * FROM account_links WHERE nonce = ? AND kind = ?', nonce, kind).toArray()[0] as Record<string, unknown> | undefined;
    if (!r || r['used_at'] !== null || Number(r['exp']) <= now) return null;
    return { kind, cid: (r['cid'] as string | null) ?? null, emailHash: String(r['email_hash']), emailSeal: (r['email_seal'] as string | null) ?? null };
  }

  /** A link used: what it was for if it was still good, and spent from now on. */
  useLink(nonce: string, kind: LinkKind, now: number): LinkRow | null {
    const link = this.peekLink(nonce, kind, now);
    if (link) this.sql.exec('UPDATE account_links SET used_at = ? WHERE nonce = ?', now, nonce);
    return link;
  }

  /** The owl protected by an email: kept as its hash and its sealed copy. Owls of one email are kept together. */
  protect(cid: string, emailHash: string, emailSeal: string, now: number): void {
    this.account(cid, now);
    this.sql.exec('UPDATE owl_accounts SET email_hash = ?, email_seal = ?, protected_at = COALESCE(protected_at, ?) WHERE cid = ?', emailHash, emailSeal, now, cid);
  }

  /** The owls an email protects, the oldest first. */
  owlsOf(emailHash: string): Account[] {
    return this.sql
      .exec('SELECT * FROM owl_accounts WHERE email_hash = ? ORDER BY created_at, cid', emailHash)
      .toArray()
      .map((r) => AccountBook.of(r as Record<string, unknown>));
  }

  /** A device takes the owl (restored by a link): every other device finds it moved, a token from before devices too. */
  bind(cid: string, dev: string, now: number): void {
    this.account(cid, now);
    this.sql.exec('UPDATE owl_accounts SET device = ?, bound_at = ? WHERE cid = ?', dev, now, cid);
  }

  // ---------- what the Worker's account routes ask (accounts.ts) ----------

  /** Where a page's device stands with its owl, and the owl's account. */
  standing(cid: string, dev: string | null, newDevice: () => string, now: number): { dev: string; account: OwlAccount } | 'moved' {
    const stand = this.stand(cid, dev, newDevice, now);
    return stand === 'moved' ? stand : { dev: stand.dev, account: accountView(this.account(cid, now)) };
  }

  /**
   * A one-tap protect link for the owl that took a ticket, to be mailed to its order's email (OP-186):
   * its expiry (ms), or null when that email protects the owl already or this order offered this owl
   * one before. The email's hash is only compared here, never written: the link's row names the owl,
   * and the Worker puts the address, sealed, in the link itself.
   */
  orderLink(cid: string, emailHash: string, orderHash: string, nonce: string, now: number): number | null {
    if (this.row(cid)?.['email_hash'] === emailHash) return null;
    this.sql.exec('DELETE FROM account_order_offers WHERE at <= ?', now - ORDER_LINK_MS - LINKS_KEPT_MS);
    if (this.sql.exec('SELECT 1 FROM account_order_offers WHERE order_hash = ? AND cid = ?', orderHash, cid).toArray().length) return null;
    this.sql.exec('INSERT INTO account_order_offers (order_hash, cid, at) VALUES (?, ?, ?)', orderHash, cid, now);
    return this.noteLink(nonce, 'protect', { cid, emailHash: '', emailSeal: null }, now, ORDER_LINK_MS);
  }

  /** A protect link for the owl, if the limits allow: its expiry (ms), or null. */
  protectLink(cid: string, emailHash: string, emailSeal: string, ipHash: string, nonce: string, now: number): number | null {
    if (!this.maySend(emailHash, ipHash, now)) return null;
    return this.noteLink(nonce, 'protect', { cid, emailHash, emailSeal }, now);
  }

  /**
   * A link for an email that asks for its owls, if the limits allow: a restore link when it protects
   * any, or else a protect link for whichever owl is on the screen that opens it.
   */
  restoreLink(emailHash: string, emailSeal: string, ipHash: string, nonce: string, now: number): { exp: number; kind: LinkKind } | null {
    if (!this.maySend(emailHash, ipHash, now)) return null;
    if (this.owlsOf(emailHash).length) return { exp: this.noteLink(nonce, 'restore', { cid: null, emailHash, emailSeal: null }, now), kind: 'restore' };
    return { exp: this.noteLink(nonce, 'protect', { cid: null, emailHash, emailSeal }, now), kind: 'protect' };
  }

  /**
   * A protect link opened: the owl it names, or the opening page's own owl (`opener`) for a link that
   * names none, is protected by its email from now on. A link that names none, opened without an owl,
   * stays good. A ticket's link (OP-186) has no email here: it protects with the one it carried
   * (`carried`, as the Worker read it from the link), and is gone without one.
   */
  confirm(nonce: string, opener: string | null, now: number, carried: CarriedEmail | null = null): Protected | 'gone' | 'no-owl' {
    const link = this.peekLink(nonce, 'protect', now);
    if (!link) return 'gone';
    const email = link.emailSeal ? { emailHash: link.emailHash, emailSeal: link.emailSeal } : carried;
    if (!email) return 'gone';
    const cid = link.cid ?? opener;
    if (!cid) return 'no-owl';
    this.useLink(nonce, 'protect', now);
    this.protect(cid, email.emailHash, email.emailSeal, now);
    const a = this.account(cid, now);
    return { cid, account: accountView(a), look: a.look };
  }

  /** A restore link's owls, as pictures to tap (the link stays good); null for a spent or lapsed link. */
  pictures(nonce: string, now: number): OwlPicture[] | null {
    const link = this.peekLink(nonce, 'restore', now);
    return link ? this.owlsOf(link.emailHash).map((a) => ({ code: a.friendCode, look: a.look })) : null;
  }

  /**
   * A restore link used: the owl with this friend code among its email's owls is on a new device from
   * now on, or stays where it is when the screen asking (`here`, its collector token) already holds it.
   * An unknown code leaves the link good.
   */
  restore(nonce: string, code: string, here: { cid: string; dev: string | null } | null, newDevice: () => string, now: number): Restored | 'gone' | 'no-owl' {
    const link = this.peekLink(nonce, 'restore', now);
    if (!link) return 'gone';
    const owl = this.owlsOf(link.emailHash).find((a) => a.friendCode === code);
    if (!owl) return 'no-owl';
    this.useLink(nonce, 'restore', now);
    if (here?.dev && here.cid === owl.cid && this.holds(owl.cid, here.dev)) return { cid: owl.cid, dev: here.dev, moved: false };
    const dev = newDevice();
    this.bind(owl.cid, dev, now);
    return { cid: owl.cid, dev, moved: true };
  }
}

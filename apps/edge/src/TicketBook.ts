/**
 * The ticket ledger (C35), written without platform APIs so it is unit-tested in Node. It keeps
 * the tickets beside the votes; the store keeps the buyer. Rules:
 *
 * - A paid order makes one ticket per unit of each ticket line, once: the store may send the same
 *   webhook twice. Its claim secret, which only the emailed link carries, is made when the order
 *   can go out: at once for an order the store rated low risk, otherwise when the owner's fraud
 *   check releases it. The book keeps only the secret's hash; a new one replaces the old (a resent
 *   link).
 * - A refund switches off that many tickets of the line (unused ones first); a cancellation
 *   switches off all of them. Votes already cast stay counted.
 * - The claim link puts the order's tickets on the device that opens it. A ticket lives on one
 *   device at a time: a holder can pass one on with a share link before its first scan, and
 *   opening a link moves it.
 * - The gate scans a ticket held on this device; the first scan starts its time.
 */
import { isTicketId, scan, statusOf, timeLeft, visualId, type ScanResult, type Ticket, type TicketStatus } from './tickets';
import type { TicketLine } from './shopify';

export interface OrderRecord {
  order: string;
  /** sha256 (hex) of the order's claim secret; none while the order is held. */
  claimHash: string | null;
  held: boolean;
  created: number;
  /** The claim link went out (the store's fulfillment was created). */
  sent: boolean;
}

export interface TicketRecord extends Ticket {
  /** The device holding it (the collector id of the browser that claimed it), or nobody yet. */
  device: string | null;
  /** sha256 (hex) of a share secret its holder made, until someone takes it. */
  shareHash: string | null;
}

export interface TicketStore {
  order(order: string): OrderRecord | null;
  orderByClaim(claimHash: string): OrderRecord | null;
  putOrder(o: OrderRecord): void;
  ticket(id: string): TicketRecord | null;
  ticketByShare(shareHash: string): TicketRecord | null;
  ticketsOf(order: string): TicketRecord[];
  onDevice(device: string): TicketRecord[];
  putTicket(t: TicketRecord): void;
}

export interface WalletTicket {
  id: string;
  kind: Ticket['kind'];
  status: TicketStatus;
  /** Time left once it is running, or until an unused ticket expires; null where it has none. */
  msLeft: number | null;
  firstScan: number | null;
  /** Event tickets: their window, so the wallet can show the night and the gate can tell it is open. */
  validFrom: number | null;
  validUntil: number | null;
}

export type Random = (n: number) => Uint8Array;
export type Hash = (s: string) => Promise<string>;

const enc = new TextEncoder();

/** sha256 hex with WebCrypto (Workers and Node both have it). */
export const sha256Hex: Hash = async (s) => {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const cryptoRandom: Random = (n) => crypto.getRandomValues(new Uint8Array(n));

function secret(random: Random): string {
  let s = '';
  for (const b of random(32)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class TicketBook {
  constructor(
    private readonly store: TicketStore,
    private readonly random: Random = cryptoRandom,
    private readonly hash: Hash = sha256Hex,
  ) {}

  /**
   * A paid order's tickets. Returns the claim secret to send in the link for a new order that is not
   * held; null for a held order or one already in the book (a repeated webhook).
   */
  async issue(order: string, lines: TicketLine[], held: boolean, now: number): Promise<{ claim: string | null; tickets: TicketRecord[] }> {
    if (this.store.order(order)) return { claim: null, tickets: this.store.ticketsOf(order) };
    const claim = held ? null : secret(this.random);
    this.store.putOrder({ order, claimHash: claim === null ? null : await this.hash(claim), held, created: now, sent: false });
    const out: TicketRecord[] = [];
    for (const l of lines) {
      for (let unit = 1; unit <= l.quantity; unit++) {
        const t: TicketRecord = {
          id: this.newId(),
          kind: l.kind,
          lengthMs: l.lengthMs,
          order,
          line: l.line,
          unit,
          created: now,
          held,
          firstScan: null,
          validFrom: l.validFrom,
          validUntil: l.validUntil,
          revoked: null,
          device: null,
          shareHash: null,
        };
        this.store.putTicket(t);
        out.push(t);
      }
    }
    return { claim, tickets: out };
  }

  private newId(): string {
    for (;;) {
      const id = visualId(this.random(8));
      if (!this.store.ticket(id)) return id;
    }
  }

  /** The claim link went out with the store's fulfillment. */
  markSent(order: string): void {
    const o = this.store.order(order);
    if (o) this.store.putOrder({ ...o, sent: true });
  }

  /** The owner's fraud check released a held order: its tickets work, and its link can go out. */
  async release(order: string): Promise<{ claim: string | null; tickets: TicketRecord[] }> {
    const o = this.store.order(order);
    if (!o) return { claim: null, tickets: [] };
    const tickets = this.store.ticketsOf(order).map((t) => ({ ...t, held: false }));
    for (const t of tickets) this.store.putTicket(t);
    if (!o.held) return { claim: null, tickets };
    const claim = secret(this.random);
    this.store.putOrder({ ...o, held: false, claimHash: await this.hash(claim), sent: false });
    return { claim, tickets };
  }

  /** A new claim secret for an order that is not held (a resent link); the old link stops working. */
  async newClaim(order: string): Promise<string | null> {
    const o = this.store.order(order);
    if (!o || o.held) return null;
    const claim = secret(this.random);
    this.store.putOrder({ ...o, claimHash: await this.hash(claim) });
    return claim;
  }

  /**
   * A refund (that many units of each line) or a cancellation (`all`): those tickets stop working.
   * Unused tickets go first. Votes they cast stay counted.
   */
  revoke(order: string, which: 'all' | Array<{ line: string; quantity: number }>, now: number): TicketRecord[] {
    const tickets = this.store.ticketsOf(order).filter((t) => t.revoked === null);
    const pick: TicketRecord[] = [];
    if (which === 'all') pick.push(...tickets);
    else {
      for (const { line, quantity } of which) {
        const ofLine = tickets.filter((t) => t.line === line).sort((a, b) => Number(a.firstScan !== null) - Number(b.firstScan !== null) || b.unit - a.unit);
        pick.push(...ofLine.slice(0, Math.max(0, quantity)));
      }
    }
    const out = pick.map((t) => ({ ...t, revoked: now }));
    for (const t of out) this.store.putTicket(t);
    return out;
  }

  /** The emailed link: the order's live tickets move onto this device. Null for an unknown secret. */
  async claim(claimSecret: string, device: string): Promise<TicketRecord[] | null> {
    const o = this.store.orderByClaim(await this.hash(claimSecret));
    if (!o) return null;
    const out = this.store.ticketsOf(o.order).filter((t) => t.revoked === null).map((t) => ({ ...t, device, shareHash: null }));
    for (const t of out) this.store.putTicket(t);
    return out;
  }

  /**
   * A share link for a ticket this device holds that has not been scanned yet (a new one replaces
   * the last): a running ticket stays with the visitor it admitted.
   */
  async share(id: string, device: string, now: number): Promise<string | null> {
    const t = this.get(id);
    const status = t ? statusOf(t, now) : null;
    if (!t || t.device !== device || (status !== 'unused' && status !== 'held')) return null;
    const s = secret(this.random);
    this.store.putTicket({ ...t, shareHash: await this.hash(s) });
    return s;
  }

  /** Opening a share link: the ticket moves to this device. */
  async take(shareSecret: string, device: string): Promise<TicketRecord | null> {
    const t = this.store.ticketByShare(await this.hash(shareSecret));
    if (!t || t.revoked !== null) return null;
    const moved = { ...t, device, shareHash: null };
    this.store.putTicket(moved);
    return moved;
  }

  /** The tickets on this device, newest first. */
  wallet(device: string, now: number): WalletTicket[] {
    return this.store
      .onDevice(device)
      .sort((a, b) => b.created - a.created || a.id.localeCompare(b.id))
      .map((t) => ({ id: t.id, kind: t.kind, ...timeLeft(t, now), firstScan: t.firstScan, validFrom: t.validFrom, validUntil: t.validUntil }));
  }

  /** The gate scans a ticket held on this device; the first scan starts its time. */
  scan(id: string, device: string, now: number): ScanResult | { ok: false; reason: 'unknown' | 'elsewhere' } {
    const t = this.get(id);
    if (!t) return { ok: false, reason: 'unknown' };
    if (t.device !== device) return { ok: false, reason: 'elsewhere' };
    const r = scan(t, now);
    if (r.ok && r.started) this.store.putTicket({ ...t, ...r.ticket });
    return r;
  }

  /** An order the book knows, and its tickets. */
  orderOf(order: string): { record: OrderRecord; tickets: TicketRecord[] } | null {
    const record = this.store.order(order);
    return record ? { record, tickets: this.store.ticketsOf(order) } : null;
  }

  /** A ticket by its visual ID; null for anything else. */
  get(id: string): TicketRecord | null {
    return isTicketId(id) ? this.store.ticket(id) : null;
  }

  status(id: string, now: number): TicketStatus | null {
    const t = this.get(id);
    return t ? statusOf(t, now) : null;
  }
}

/** The book in memory (tests, local mode). */
export class MemoryTicketStore implements TicketStore {
  private readonly orders = new Map<string, OrderRecord>();
  private readonly tickets = new Map<string, TicketRecord>();
  order(order: string) {
    return this.orders.get(order) ?? null;
  }
  orderByClaim(claimHash: string) {
    return [...this.orders.values()].find((o) => o.claimHash === claimHash) ?? null;
  }
  putOrder(o: OrderRecord) {
    this.orders.set(o.order, { ...o });
  }
  ticket(id: string) {
    const t = this.tickets.get(id);
    return t ? { ...t } : null;
  }
  ticketByShare(shareHash: string) {
    const t = [...this.tickets.values()].find((x) => x.shareHash === shareHash);
    return t ? { ...t } : null;
  }
  ticketsOf(order: string) {
    return [...this.tickets.values()].filter((t) => t.order === order).sort((a, b) => a.line.localeCompare(b.line) || a.unit - b.unit).map((t) => ({ ...t }));
  }
  onDevice(device: string) {
    return [...this.tickets.values()].filter((t) => t.device === device).map((t) => ({ ...t }));
  }
  putTicket(t: TicketRecord) {
    this.tickets.set(t.id, { ...t });
  }
}

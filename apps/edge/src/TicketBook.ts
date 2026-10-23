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
 * - Opening night (C42): a pass order from the park's free-pass link keeps the link to the Opening
 *   Night Ticket it came from, and goes with that ticket if the ticket is switched off. The book
 *   counts the night: tickets issued and scanned, passes claimed through the link and without it.
 */
import { isTicketId, scan, statusOf, timeLeft, visualId, type ScanResult, type Ticket, type TicketKind, type TicketStatus } from './tickets';
import type { Decision, Outcome } from './fraudLink';
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

/** A pass order from opening night's offer (C42), and the Opening Night Ticket it came from. */
export interface PassLink {
  order: string;
  /** The ticket, when the park's link named one that went through the gate; null: a pass without a link. */
  fromTicket: string | null;
  at: number;
}

/**
 * The fraud check of an order (C45): the pipeline's verdict, or a fail-open when it did not answer,
 * and what became of the order. Order numbers, the Worker's own ids, the score and the reason codes
 * only.
 */
export interface OrderCheck {
  order: string;
  /** The store's order number (`#1001`), for the owner's page. */
  name: string;
  /** The Worker's ids for the pipeline: one transaction per order, one request per scoring call. */
  transaction: string;
  request: string;
  decision: Decision | 'fail-open';
  score: number | null;
  reasons: string[];
  modelVersion: string | null;
  scoringMs: number | null;
  /** No verdict within the budget (a fail-open); `fallback` is any fail-open, an error included. */
  timedOut: boolean;
  fallback: boolean;
  /** When the paid webhook came in. */
  receivedAt: number;
  /** The park's address the webhook came to: a held order's claim link, sent later, points there. */
  origin: string;
  outcome: Outcome;
  /** A held order: when it is released if the owner does nothing. */
  holdUntil: number | null;
  /** When the outcome last changed. */
  settledAt: number;
  /** The checkout response went back to the pipeline. */
  responded: boolean;
}

export interface TicketStore {
  order(order: string): OrderRecord | null;
  orderByClaim(claimHash: string): OrderRecord | null;
  putOrder(o: OrderRecord): void;
  ticket(id: string): TicketRecord | null;
  ticketByShare(shareHash: string): TicketRecord | null;
  ticketsOf(order: string): TicketRecord[];
  onDevice(device: string): TicketRecord[];
  /** Every ticket of a kind (opening night's count). */
  ofKind(kind: TicketKind): TicketRecord[];
  putTicket(t: TicketRecord): void;
  passLink(order: string): PassLink | null;
  passLinksFrom(ticketId: string): PassLink[];
  passLinks(): PassLink[];
  putPassLink(l: PassLink): void;
  check(order: string): OrderCheck | null;
  putCheck(c: OrderCheck): void;
  /** The newest checks first. */
  recentChecks(limit: number): OrderCheck[];
  /** Orders held for review, the oldest first. */
  heldChecks(): OrderCheck[];
}

export interface WalletTicket {
  id: string;
  kind: Ticket['kind'];
  status: TicketStatus;
  /** Time left once it is running, or until an unused ticket expires; null where it has none. */
  msLeft: number | null;
  firstScan: number | null;
  /** Windowed tickets: their window, so the wallet can show the night and the gate can tell it is open. */
  validFrom: number | null;
  validUntil: number | null;
  /**
   * An Opening Night Ticket's free pass (C42): `ready` once the ticket has gone through the gate
   * and while its night runs, `claimed` once a pass came from it through the link.
   */
  freePass?: 'ready' | 'claimed';
}

/** Opening night's count (C42), for the keepers' page. Switched-off tickets are left out. */
export interface OpeningCounts {
  /** Opening Night Tickets issued, and those that went through the gate. */
  issued: number;
  scanned: number;
  /** Passes claimed through the park's link, and passes sold with the code but no link. */
  linkedPasses: number;
  unlinkedPasses: number;
  /** Tickets that turned into a pass, as a share of the tickets scanned (null before any scan). */
  converted: number;
  conversion: number | null;
  /** Opening Night Tickets and opening passes switched off (refunded, cancelled or declined). */
  revoked: number;
}

/** One ticket of opening night, as the keepers' CSV lists it: order numbers and ticket IDs only. */
export interface OpeningRow {
  kind: 'opening-night' | 'pass';
  ticket: string;
  order: string;
  status: TicketStatus;
  firstScan: number | null;
  /** A pass: the Opening Night Ticket it came from (empty without a link). */
  fromTicket: string | null;
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

/** How long one webhook may work on an order before another may take it over (one that died part way). */
export const ORDER_LEASE_MS = 20_000;

export class TicketBook {
  /** Orders a webhook is working on now. Kept in memory: a lease lasts seconds, never across a restart. */
  private readonly leases = new Map<string, number>();

  constructor(
    private readonly store: TicketStore,
    private readonly random: Random = cryptoRandom,
    private readonly hash: Hash = sha256Hex,
  ) {}

  /**
   * One webhook at a time per order: false while another holds the order's lease. The store sends a
   * free order's orders/create and orders/paid together (C42), and any webhook may come twice.
   */
  lease(order: string, now: number): boolean {
    const until = this.leases.get(order);
    if (until !== undefined && until > now) return false;
    if (this.leases.size > 1000) for (const [o, u] of this.leases) if (u <= now) this.leases.delete(o);
    this.leases.set(order, now + ORDER_LEASE_MS);
    return true;
  }

  unlease(order: string): void {
    this.leases.delete(order);
  }

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
   * Unused tickets go first. Votes they cast stay counted. A pass that came from an Opening Night
   * Ticket through the park's link goes with it (C42).
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
    const out: TicketRecord[] = pick.map((t) => ({ ...t, revoked: now }));
    for (const t of out) this.store.putTicket(t);
    for (const t of out.filter((x) => x.kind === 'opening-night')) {
      for (const l of this.store.passLinksFrom(t.id)) out.push(...this.revoke(l.order, 'all', now));
    }
    return out;
  }

  /**
   * A pass order from opening night's offer (C42), kept once: the Opening Night Ticket the park's
   * link named, when that ticket went through the gate and still works; otherwise it counts as a
   * pass without a link (the code used some other way). A linked pass that is on no device yet goes
   * onto the ticket's, so the owl finds it in the wallet it claimed it from.
   */
  linkPass(order: string, fromTicket: string | null, now: number): PassLink | null {
    if (!this.store.order(order)) return null;
    const known = this.store.passLink(order);
    if (known) return known;
    const from = fromTicket ? this.get(fromTicket) : null;
    const linked = from !== null && from.kind === 'opening-night' && from.firstScan !== null && from.revoked === null ? from : null;
    const link: PassLink = { order, fromTicket: linked?.id ?? null, at: now };
    this.store.putPassLink(link);
    if (linked?.device) {
      for (const p of this.store.ticketsOf(order)) if (p.device === null && p.revoked === null) this.store.putTicket({ ...p, device: linked.device });
    }
    return link;
  }

  /** The free pass of an Opening Night Ticket, as its wallet line shows it (undefined for other tickets). */
  private freePass(t: TicketRecord, status: TicketStatus): WalletTicket['freePass'] {
    if (t.kind !== 'opening-night') return undefined;
    if (this.store.passLinksFrom(t.id).length) return 'claimed';
    return status === 'active' ? 'ready' : undefined;
  }

  /** Whether an Opening Night Ticket on this device may claim its free pass now (C42). */
  passOffer(id: string, device: string, now: number): { ok: true } | { ok: false; reason: 'unknown' | 'not-yours' | 'not-ready' | 'claimed' } {
    const t = this.get(id);
    if (!t || t.kind !== 'opening-night') return { ok: false, reason: 'unknown' };
    if (t.device !== device) return { ok: false, reason: 'not-yours' };
    const pass = this.freePass(t, statusOf(t, now));
    return pass === 'ready' ? { ok: true } : { ok: false, reason: pass === 'claimed' ? 'claimed' : 'not-ready' };
  }

  /** Opening night's count and its tickets (C42): order numbers and ticket IDs only. */
  opening(now: number): { counts: OpeningCounts; rows: OpeningRow[] } {
    const tickets = this.store.ofKind('opening-night');
    const links = this.store.passLinks();
    const rows: OpeningRow[] = tickets.map((t) => ({ kind: 'opening-night', ticket: t.id, order: t.order, status: statusOf(t, now), firstScan: t.firstScan, fromTicket: null }));
    for (const l of links) {
      for (const p of this.store.ticketsOf(l.order)) rows.push({ kind: 'pass', ticket: p.id, order: p.order, status: statusOf(p, now), firstScan: p.firstScan, fromTicket: l.fromTicket });
    }
    const live = rows.filter((r) => r.status !== 'revoked');
    const nights = live.filter((r) => r.kind === 'opening-night');
    const scanned = nights.filter((r) => r.firstScan !== null).length;
    const passes = live.filter((r) => r.kind === 'pass');
    const fromLive = new Set(nights.map((r) => r.ticket));
    const converted = new Set(passes.filter((r) => r.fromTicket !== null && fromLive.has(r.fromTicket)).map((r) => r.fromTicket)).size;
    return {
      counts: {
        issued: nights.length,
        scanned,
        linkedPasses: passes.filter((r) => r.fromTicket !== null).length,
        unlinkedPasses: passes.filter((r) => r.fromTicket === null).length,
        converted,
        conversion: scanned > 0 ? converted / scanned : null,
        revoked: rows.length - live.length,
      },
      rows,
    };
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
      .map((t) => {
        const left = timeLeft(t, now);
        const freePass = this.freePass(t, left.status);
        return { id: t.id, kind: t.kind, ...left, firstScan: t.firstScan, validFrom: t.validFrom, validUntil: t.validUntil, ...(freePass ? { freePass } : {}) };
      });
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

  /** An order's fraud check (C45), as first decided: a second webhook for the order finds it here and is not scored again. */
  recordCheck(c: OrderCheck): OrderCheck {
    const known = this.store.check(c.order);
    if (known) return known;
    this.store.putCheck(c);
    return c;
  }

  /** What became of a checked order (held, released, refunded...), and whether the pipeline was told. */
  settleCheck(order: string, outcome: Outcome, now: number, responded?: boolean): OrderCheck | null {
    const c = this.store.check(order);
    if (!c) return null;
    const next: OrderCheck = { ...c, outcome, settledAt: now, holdUntil: outcome === 'held' ? c.holdUntil : null, responded: responded ?? c.responded };
    this.store.putCheck(next);
    return next;
  }

  check(order: string): OrderCheck | null {
    return this.store.check(order);
  }

  /** The owner's page: orders held for review, and the latest checks. */
  checks(limit: number): { held: OrderCheck[]; recent: OrderCheck[] } {
    return { held: this.store.heldChecks(), recent: this.store.recentChecks(Math.max(1, Math.min(200, limit))) };
  }

  /** Held orders left past their time with no action: they are released (fail open). */
  dueHolds(now: number): OrderCheck[] {
    return this.store.heldChecks().filter((c) => c.holdUntil !== null && c.holdUntil <= now);
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
  private readonly links = new Map<string, PassLink>();
  private readonly checksByOrder = new Map<string, OrderCheck>();
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
  ofKind(kind: TicketKind) {
    return [...this.tickets.values()].filter((t) => t.kind === kind).sort((a, b) => a.created - b.created || a.id.localeCompare(b.id)).map((t) => ({ ...t }));
  }
  putTicket(t: TicketRecord) {
    this.tickets.set(t.id, { ...t });
  }
  passLink(order: string) {
    const l = this.links.get(order);
    return l ? { ...l } : null;
  }
  passLinksFrom(ticketId: string) {
    return [...this.links.values()].filter((l) => l.fromTicket === ticketId).map((l) => ({ ...l }));
  }
  passLinks() {
    return [...this.links.values()].sort((a, b) => a.at - b.at || a.order.localeCompare(b.order)).map((l) => ({ ...l }));
  }
  putPassLink(l: PassLink) {
    this.links.set(l.order, { ...l });
  }
  check(order: string) {
    const c = this.checksByOrder.get(order);
    return c ? { ...c, reasons: [...c.reasons] } : null;
  }
  putCheck(c: OrderCheck) {
    this.checksByOrder.set(c.order, { ...c, reasons: [...c.reasons] });
  }
  recentChecks(limit: number) {
    return [...this.checksByOrder.values()].sort((a, b) => b.receivedAt - a.receivedAt || b.order.localeCompare(a.order)).slice(0, limit).map((c) => ({ ...c, reasons: [...c.reasons] }));
  }
  heldChecks() {
    return [...this.checksByOrder.values()].filter((c) => c.outcome === 'held').sort((a, b) => a.receivedAt - b.receivedAt).map((c) => ({ ...c, reasons: [...c.reasons] }));
  }
}

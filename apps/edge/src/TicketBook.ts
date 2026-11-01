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
 *   opening a link moves it. Once scanned, a ticket stays with the owl it admitted (OP-174): no
 *   link moves a running ticket, so a forwarded email cannot let a second owl in on it.
 * - The gate scans a ticket held on this device; the first scan starts its time.
 * - The gate's checkout (OP-175, OP-180): an owl asks for a one-time checkout token, which rides in the
 *   cart as an attribute. A paid order that carries a known, unexpired, unused token puts its
 *   never-scanned tickets on that owl at once, with no email needed; the token then names that
 *   order and moves nothing again. The book keeps only the token's hash.
 * - Opening night (C42): a pass order from the park's pass link (half price, OP-062) keeps the link
 *   to the Opening Night Ticket it came from, and goes with that ticket if the ticket is switched
 *   off. The book counts the night: tickets issued and scanned, passes claimed through the link and
 *   without it, and what the passes sold for.
 * - The gate's Day Ticket (OP-180): a Day or Night ticket on the owl may have the same half-price
 *   pass offered (the Worker offers it only while opening night runs), once per ticket and never to
 *   an owl that already holds an annual pass. A pass from its link is linked and counted as above,
 *   but stays if that ticket is refunded: the ticket was paid for, unlike the free Opening Night Ticket.
 */
import { isTicketId, scan, statusOf, timeLeft, visualId, type ScanResult, type Ticket, type TicketKind, type TicketStatus } from './tickets';
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
  /** What the order's passes sold for, in cents before tax (OP-062: half price); null where it was not kept. */
  cents: number | null;
}

/** A checkout the gate opened for an owl (OP-175): the token's hash, the owl, and the order it went to once paid. */
export interface CheckoutRecord {
  hash: string;
  device: string;
  created: number;
  expires: number;
  /** The paid order the token placed tickets from; null until then. */
  order: string | null;
}

/** Why a paid order's checkout token placed nothing (OP-175): the claim email is the way then. */
export type PlaceRefusal = 'unknown' | 'expired' | 'used' | 'repeat' | 'no-order';

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
  checkout(hash: string): CheckoutRecord | null;
  putCheckout(c: CheckoutRecord): void;
  /** Forgets checkouts made before this time. */
  dropCheckouts(before: number): void;
  /** Whether a refund (the store's refund id) has already switched tickets off (OP-145). */
  refundSeen(refund: string): boolean;
  putRefund(refund: string, order: string, at: number): void;
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
   * An Opening Night Ticket's pass offer (C42; free at first, half price since OP-062): `ready` once
   * the ticket has gone through the gate and while its night runs, `claimed` once a pass came from
   * it through the link. A Day or Night ticket (OP-180) shows only `claimed`: its offer follows its
   * purchase at the gate, not the wallet.
   */
  freePass?: 'ready' | 'claimed';
}

/** The kinds whose holder may be offered opening night's half-price pass (C42; OP-180: a Day or Night ticket too). */
export const PASS_OFFER_KINDS: ReadonlySet<TicketKind> = new Set<TicketKind>(['opening-night', 'day', 'night']);

/** Why a ticket's holder is not offered the pass now. */
export type PassOfferRefusal = 'unknown' | 'not-yours' | 'not-ready' | 'claimed' | 'has-pass';

/** A ticket whose time has not run out, nor been switched off: it can still let its owl in. */
const live = (status: TicketStatus): boolean => status === 'unused' || status === 'held' || status === 'active';

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
  /** What the night's passes sold for, in cents before tax (OP-062), with and without the link. */
  passRevenue: number;
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
  /** A pass: its part of what its order's passes sold for, in cents before tax (null where not kept). */
  paid: number | null;
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

/** How long a gate checkout token works (OP-175): a cart left open overnight still lands its ticket. */
export const CHECKOUT_TTL_MS = 24 * 60 * 60_000;
/** How long a checkout is remembered at all, so a late repeat of its webhook still finds it used. */
export const CHECKOUT_KEEP_MS = 7 * 24 * 60 * 60_000;

/** How long one webhook may work on an order before another may take it over (one that died part way). */
export const ORDER_LEASE_MS = 20_000;

/** Whether a link may move this ticket to another owl: only a live one never scanned (OP-174). */
export const movable = (t: TicketRecord): boolean => t.revoked === null && t.firstScan === null;

/**
 * Of a claim link's live tickets, those already running on another owl: they stay there (OP-174), and
 * a claim that finds only these, and none of the order on this owl, is answered "already in use".
 */
export const inUseElsewhere = (live: readonly TicketRecord[], device: string): number => live.filter((t) => t.firstScan !== null && t.device !== null && t.device !== device).length;

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
   * Ticket through the park's link goes with it (C42). A refund named by its store id switches
   * tickets off once: the store may send refunds/create again, and a second delivery must not take
   * another ticket of the line (OP-145).
   */
  revoke(order: string, which: 'all' | Array<{ line: string; quantity: number }>, now: number, refund?: string): TicketRecord[] {
    if (refund !== undefined) {
      if (this.store.refundSeen(refund)) return [];
      this.store.putRefund(refund, order, now);
    }
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
    // Only the free Opening Night Ticket takes its pass with it; a paid Day ticket's refund leaves the pass (OP-180).
    for (const t of out.filter((x) => x.kind === 'opening-night')) {
      for (const l of this.store.passLinksFrom(t.id)) out.push(...this.revoke(l.order, 'all', now));
    }
    return out;
  }

  /**
   * A pass order from opening night's offer (C42), kept once: the ticket the park's link named, when
   * it may have the offer (an Opening Night Ticket through the gate, or a Day or Night ticket, OP-180)
   * and still works; otherwise it counts as a pass without a link (the code used some other way). A linked pass that is on no device yet goes
   * onto the ticket's, so the owl finds it in the wallet it claimed it from. `cents`: what the
   * order's passes sold for (OP-062).
   */
  linkPass(order: string, fromTicket: string | null, now: number, cents: number | null = null): PassLink | null {
    if (!this.store.order(order)) return null;
    const known = this.store.passLink(order);
    if (known) return known;
    const from = fromTicket ? this.get(fromTicket) : null;
    const linked = from !== null && this.offers(from, now) ? from : null;
    const link: PassLink = { order, fromTicket: linked?.id ?? null, at: now, cents };
    this.store.putPassLink(link);
    if (linked?.device) {
      for (const p of this.store.ticketsOf(order)) if (p.device === null && p.revoked === null) this.store.putTicket({ ...p, device: linked.device });
    }
    return link;
  }

  /**
   * Whether a pass order may come from this ticket: an Opening Night Ticket that went through the
   * gate and still works (C42), or a Day or Night ticket that still works, scanned or not (OP-180:
   * the offer follows its purchase at the gate, before the first scan).
   */
  private offers(t: TicketRecord, now: number): boolean {
    if (!PASS_OFFER_KINDS.has(t.kind) || t.revoked !== null) return false;
    return t.kind === 'opening-night' ? t.firstScan !== null : live(statusOf(t, now));
  }

  /** The pass offer of a ticket, as its wallet line shows it (undefined for other tickets). */
  private freePass(t: TicketRecord, status: TicketStatus): WalletTicket['freePass'] {
    if (!PASS_OFFER_KINDS.has(t.kind)) return undefined;
    if (this.store.passLinksFrom(t.id).length) return 'claimed';
    return t.kind === 'opening-night' && status === 'active' ? 'ready' : undefined;
  }

  /** Whether this owl holds an annual pass that can still let it in: it is never offered another (OP-180). */
  private holdsPass(device: string, now: number): boolean {
    return this.store.onDevice(device).some((t) => t.kind === 'annual' && live(statusOf(t, now)));
  }

  /**
   * Whether the holder of this ticket on this owl may be offered the half-price pass now: an Opening
   * Night Ticket through the gate while its night runs (C42), or a Day or Night ticket that still
   * works (OP-180; the Worker adds that opening night must be on). Once per ticket (`claimed` after a
   * pass came from it), and never to an owl that holds an annual pass already (`has-pass`).
   */
  passOffer(id: string, device: string, now: number): { ok: true; kind: TicketKind } | { ok: false; reason: PassOfferRefusal } {
    const t = this.get(id);
    if (!t || !PASS_OFFER_KINDS.has(t.kind)) return { ok: false, reason: 'unknown' };
    if (t.device !== device) return { ok: false, reason: 'not-yours' };
    if (this.store.passLinksFrom(t.id).length) return { ok: false, reason: 'claimed' };
    if (this.holdsPass(device, now)) return { ok: false, reason: 'has-pass' };
    const status = statusOf(t, now);
    const ready = t.kind === 'opening-night' ? status === 'active' : live(status);
    return ready ? { ok: true, kind: t.kind } : { ok: false, reason: 'not-ready' };
  }

  /**
   * Opening night's count and its tickets (C42): order numbers and ticket IDs only. An order's
   * amount is shared out over its passes to the cent, so a pass switched off takes its part out
   * of the night's revenue.
   */
  opening(now: number): { counts: OpeningCounts; rows: OpeningRow[] } {
    const tickets = this.store.ofKind('opening-night');
    const links = this.store.passLinks();
    const rows: OpeningRow[] = tickets.map((t) => ({ kind: 'opening-night', ticket: t.id, order: t.order, status: statusOf(t, now), firstScan: t.firstScan, fromTicket: null, paid: null }));
    for (const l of links) {
      // Only the order's passes: another ticket in the same cart is no part of the night.
      const own = this.store.ticketsOf(l.order).filter((p) => p.kind === 'annual');
      const part = (i: number) => (l.cents === null ? null : Math.floor(l.cents / own.length) + (i < l.cents % own.length ? 1 : 0));
      own.forEach((p, i) => rows.push({ kind: 'pass', ticket: p.id, order: p.order, status: statusOf(p, now), firstScan: p.firstScan, fromTicket: l.fromTicket, paid: part(i) }));
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
        passRevenue: passes.reduce((n, r) => n + (r.paid ?? 0), 0),
        revoked: rows.length - live.length,
      },
      rows,
    };
  }

  /** A one-time checkout token for this owl (OP-175); the book keeps only its hash. */
  async newCheckout(device: string, now: number): Promise<string> {
    this.store.dropCheckouts(now - CHECKOUT_KEEP_MS);
    const token = secret(this.random);
    this.store.putCheckout({ hash: await this.hash(token), device, created: now, expires: now + CHECKOUT_TTL_MS, order: null });
    return token;
  }

  /**
   * A paid order carried a checkout token (OP-175): its live tickets that have never been scanned
   * go onto the owl that opened the checkout, as a claim would put them (OP-174's rule: a running
   * ticket stays where it is). A token works for one order, once: a repeat of the same order's
   * webhook moves nothing again (a claim may have moved the tickets since).
   */
  async placeByCheckout(order: string, token: string, now: number): Promise<{ device: string; tickets: TicketRecord[] } | { refused: PlaceRefusal }> {
    const c = this.store.checkout(await this.hash(token));
    if (!c) return { refused: 'unknown' };
    if (c.order !== null) return { refused: c.order === order ? 'repeat' : 'used' };
    if (now > c.expires) return { refused: 'expired' };
    if (!this.store.order(order)) return { refused: 'no-order' };
    const out = this.store
      .ticketsOf(order)
      .filter(movable)
      .map((t) => ({ ...t, device: c.device, shareHash: null }));
    for (const t of out) this.store.putTicket(t);
    this.store.putCheckout({ ...c, order });
    return { device: c.device, tickets: out };
  }

  /** The emailed link's live tickets as they stand, before a claim moves them. Null for an unknown secret. */
  async claimable(claimSecret: string): Promise<TicketRecord[] | null> {
    const o = this.store.orderByClaim(await this.hash(claimSecret));
    return o ? this.store.ticketsOf(o.order).filter((t) => t.revoked === null) : null;
  }

  /**
   * The emailed link: the order's live tickets that have never been scanned move onto this device
   * (OP-174). A running ticket stays with the owl it admitted, as with a share link: a forwarded
   * email puts no second owl in on it. Returns the tickets it moved; null for an unknown secret.
   */
  async claim(claimSecret: string, device: string): Promise<TicketRecord[] | null> {
    const live = await this.claimable(claimSecret);
    if (!live) return null;
    const out = live.filter(movable).map((t) => ({ ...t, device, shareHash: null }));
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

  /**
   * Opening a share link: the ticket moves to this device. `in-use` once the ticket has been scanned
   * (OP-174): a link made before the visit stops moving it when the visit starts.
   */
  async take(shareSecret: string, device: string): Promise<TicketRecord | 'in-use' | null> {
    const t = this.store.ticketByShare(await this.hash(shareSecret));
    if (!t || t.revoked !== null) return null;
    if (!movable(t)) return t.device === device ? t : 'in-use';
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
  private readonly checkouts = new Map<string, CheckoutRecord>();
  private readonly refunds = new Set<string>();
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
  checkout(hash: string) {
    const c = this.checkouts.get(hash);
    return c ? { ...c } : null;
  }
  putCheckout(c: CheckoutRecord) {
    this.checkouts.set(c.hash, { ...c });
  }
  dropCheckouts(before: number) {
    for (const [h, c] of this.checkouts) if (c.created < before) this.checkouts.delete(h);
  }
  refundSeen(refund: string) {
    return this.refunds.has(refund);
  }
  putRefund(refund: string) {
    this.refunds.add(refund);
  }
}

/**
 * The ticket book's SQLite tables, kept beside the votes in the vote ledger's Durable Object.
 * Apart from the object class so tests run it against any SQLite with the same
 * `exec(query, ...bindings)` shape. Only order and line numbers are stored, never a buyer.
 */
import type { Decision, Outcome } from './fraudLink';
import type { OrderCheck, OrderRecord, PassLink, TicketRecord, TicketStore } from './TicketBook';
import type { TicketKind } from './tickets';

type OrderRow = {
  order_id: string;
  claim_hash: string | null;
  held: number;
  created: number;
  sent: number;
};

type TicketRow = {
  id: string;
  kind: string;
  length_ms: number | null;
  order_id: string;
  line: string;
  unit: number;
  created: number;
  held: number;
  first_scan: number | null;
  valid_from: number | null;
  valid_until: number | null;
  revoked: number | null;
  device: string | null;
  share_hash: string | null;
};

type LinkRow = { order_id: string; from_ticket: string | null; at: number };

type CheckRow = {
  order_id: string;
  name: string;
  transaction_id: string;
  request_id: string;
  decision: string;
  score: number | null;
  reasons: string;
  model_version: string | null;
  scoring_ms: number | null;
  timed_out: number;
  fallback: number;
  received_at: number;
  origin: string;
  outcome: string;
  hold_until: number | null;
  settled_at: number;
  responded: number;
};

const check = (r: CheckRow): OrderCheck => ({
  order: r.order_id,
  name: r.name,
  transaction: r.transaction_id,
  request: r.request_id,
  decision: r.decision as Decision | 'fail-open',
  score: r.score,
  reasons: (JSON.parse(r.reasons) as unknown[]).filter((x): x is string => typeof x === 'string'),
  modelVersion: r.model_version,
  scoringMs: r.scoring_ms,
  timedOut: r.timed_out === 1,
  fallback: r.fallback === 1,
  receivedAt: r.received_at,
  origin: r.origin,
  outcome: r.outcome as Outcome,
  holdUntil: r.hold_until,
  settledAt: r.settled_at,
  responded: r.responded === 1,
});

const link = (r: LinkRow): PassLink => ({ order: r.order_id, fromTicket: r.from_ticket, at: r.at });

const order = (r: OrderRow): OrderRecord => ({ order: r.order_id, claimHash: r.claim_hash, held: r.held === 1, created: r.created, sent: r.sent === 1 });

const ticket = (r: TicketRow): TicketRecord => ({
  id: r.id,
  kind: r.kind as TicketKind,
  lengthMs: r.length_ms,
  order: r.order_id,
  line: r.line,
  unit: r.unit,
  created: r.created,
  held: r.held === 1,
  firstScan: r.first_scan,
  validFrom: r.valid_from,
  validUntil: r.valid_until,
  revoked: r.revoked,
  device: r.device,
  shareHash: r.share_hash,
});

export class SqlTicketStore implements TicketStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS ticket_orders (order_id TEXT PRIMARY KEY, claim_hash TEXT, held INTEGER NOT NULL, created INTEGER NOT NULL, sent INTEGER NOT NULL)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS ticket_orders_claim ON ticket_orders (claim_hash)`);
    sql.exec(
      `CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, kind TEXT NOT NULL, length_ms INTEGER, order_id TEXT NOT NULL, line TEXT NOT NULL, unit INTEGER NOT NULL, created INTEGER NOT NULL, held INTEGER NOT NULL, first_scan INTEGER, valid_from INTEGER, valid_until INTEGER, revoked INTEGER, device TEXT, share_hash TEXT, UNIQUE (order_id, line, unit))`,
    );
    sql.exec(`CREATE INDEX IF NOT EXISTS tickets_order ON tickets (order_id)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS tickets_device ON tickets (device)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS tickets_share ON tickets (share_hash)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS tickets_kind ON tickets (kind)`);
    // Opening night's pass orders (C42): the Opening Night Ticket each came from, or none.
    sql.exec(`CREATE TABLE IF NOT EXISTS opening_passes (order_id TEXT PRIMARY KEY, from_ticket TEXT, at INTEGER NOT NULL)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS opening_passes_from ON opening_passes (from_ticket)`);
    // The fraud check of each ticket order (C45): the verdict and what became of the order.
    sql.exec(
      `CREATE TABLE IF NOT EXISTS order_checks (order_id TEXT PRIMARY KEY, name TEXT NOT NULL, transaction_id TEXT NOT NULL, request_id TEXT NOT NULL, decision TEXT NOT NULL, score REAL, reasons TEXT NOT NULL, model_version TEXT, scoring_ms REAL, timed_out INTEGER NOT NULL, fallback INTEGER NOT NULL, received_at INTEGER NOT NULL, origin TEXT NOT NULL, outcome TEXT NOT NULL, hold_until INTEGER, settled_at INTEGER NOT NULL, responded INTEGER NOT NULL)`,
    );
    sql.exec(`CREATE INDEX IF NOT EXISTS order_checks_outcome ON order_checks (outcome, received_at)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS order_checks_received ON order_checks (received_at)`);
  }

  order(id: string) {
    const r = this.sql.exec<OrderRow>(`SELECT * FROM ticket_orders WHERE order_id = ?`, id).toArray()[0];
    return r ? order(r) : null;
  }
  orderByClaim(claimHash: string) {
    const r = this.sql.exec<OrderRow>(`SELECT * FROM ticket_orders WHERE claim_hash = ?`, claimHash).toArray()[0];
    return r ? order(r) : null;
  }
  putOrder(o: OrderRecord) {
    this.sql.exec(`INSERT OR REPLACE INTO ticket_orders (order_id, claim_hash, held, created, sent) VALUES (?, ?, ?, ?, ?)`, o.order, o.claimHash, o.held ? 1 : 0, o.created, o.sent ? 1 : 0);
  }
  ticket(id: string) {
    const r = this.sql.exec<TicketRow>(`SELECT * FROM tickets WHERE id = ?`, id).toArray()[0];
    return r ? ticket(r) : null;
  }
  ticketByShare(shareHash: string) {
    const r = this.sql.exec<TicketRow>(`SELECT * FROM tickets WHERE share_hash = ?`, shareHash).toArray()[0];
    return r ? ticket(r) : null;
  }
  ticketsOf(id: string) {
    return this.sql.exec<TicketRow>(`SELECT * FROM tickets WHERE order_id = ? ORDER BY line, unit`, id).toArray().map(ticket);
  }
  onDevice(device: string) {
    return this.sql.exec<TicketRow>(`SELECT * FROM tickets WHERE device = ?`, device).toArray().map(ticket);
  }
  ofKind(kind: TicketKind) {
    return this.sql.exec<TicketRow>(`SELECT * FROM tickets WHERE kind = ? ORDER BY created, id`, kind).toArray().map(ticket);
  }
  passLink(order: string) {
    const r = this.sql.exec<LinkRow>(`SELECT * FROM opening_passes WHERE order_id = ?`, order).toArray()[0];
    return r ? link(r) : null;
  }
  passLinksFrom(ticketId: string) {
    return this.sql.exec<LinkRow>(`SELECT * FROM opening_passes WHERE from_ticket = ?`, ticketId).toArray().map(link);
  }
  passLinks() {
    return this.sql.exec<LinkRow>(`SELECT * FROM opening_passes ORDER BY at, order_id`).toArray().map(link);
  }
  putPassLink(l: PassLink) {
    this.sql.exec(`INSERT OR IGNORE INTO opening_passes (order_id, from_ticket, at) VALUES (?, ?, ?)`, l.order, l.fromTicket, l.at);
  }
  check(order: string) {
    const r = this.sql.exec<CheckRow>(`SELECT * FROM order_checks WHERE order_id = ?`, order).toArray()[0];
    return r ? check(r) : null;
  }
  putCheck(c: OrderCheck) {
    this.sql.exec(
      `INSERT OR REPLACE INTO order_checks (order_id, name, transaction_id, request_id, decision, score, reasons, model_version, scoring_ms, timed_out, fallback, received_at, origin, outcome, hold_until, settled_at, responded) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      c.order, c.name, c.transaction, c.request, c.decision, c.score, JSON.stringify(c.reasons), c.modelVersion, c.scoringMs, c.timedOut ? 1 : 0, c.fallback ? 1 : 0, c.receivedAt, c.origin, c.outcome, c.holdUntil, c.settledAt, c.responded ? 1 : 0,
    );
  }
  recentChecks(limit: number) {
    return this.sql.exec<CheckRow>(`SELECT * FROM order_checks ORDER BY received_at DESC, order_id DESC LIMIT ?`, limit).toArray().map(check);
  }
  heldChecks() {
    return this.sql.exec<CheckRow>(`SELECT * FROM order_checks WHERE outcome = 'held' ORDER BY received_at`).toArray().map(check);
  }
  putTicket(t: TicketRecord) {
    this.sql.exec(
      `INSERT OR REPLACE INTO tickets (id, kind, length_ms, order_id, line, unit, created, held, first_scan, valid_from, valid_until, revoked, device, share_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t.id, t.kind, t.lengthMs, t.order, t.line, t.unit, t.created, t.held ? 1 : 0, t.firstScan, t.validFrom, t.validUntil, t.revoked, t.device, t.shareHash,
    );
  }
}

/**
 * The ticket book's SQLite tables, kept beside the votes in the vote ledger's Durable Object.
 * Apart from the object class so tests run it against any SQLite with the same
 * `exec(query, ...bindings)` shape. Only order and line numbers are stored, never a buyer.
 */
import type { OrderRecord, TicketRecord, TicketStore } from './TicketBook';
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
  putTicket(t: TicketRecord) {
    this.sql.exec(
      `INSERT OR REPLACE INTO tickets (id, kind, length_ms, order_id, line, unit, created, held, first_scan, valid_from, valid_until, revoked, device, share_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t.id, t.kind, t.lengthMs, t.order, t.line, t.unit, t.created, t.held ? 1 : 0, t.firstScan, t.validFrom, t.validUntil, t.revoked, t.device, t.shareHash,
    );
  }
}

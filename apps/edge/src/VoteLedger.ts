/**
 * Durable Object holding the Realm Vote and the ticket book (C35) in its SQLite storage, so a
 * ticket and its votes live together. One object for the park. The Worker verifies passes,
 * admission and the store's signatures before calling in; this object only applies the rules.
 */
import { DurableObject } from 'cloudflare:workers';
import { Ledger, parkDay, parkMonth, previousMonth, type VoteStore } from './Ledger';
import { SqlTicketStore } from './sqlTicketStore';
import { TicketBook } from './TicketBook';
import { ticketDesk } from './ticketDesk';
import type { Env } from './env';

/** Realms with an idol to vote at, in the park's fixed order (neutral ids, never public names). */
export const VOTABLE_REALMS = ['grove', 'market'];

class SqlVoteStore implements VoteStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS votes (day TEXT NOT NULL, visitor TEXT NOT NULL, realm TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (day, visitor))`);
    sql.exec(`CREATE INDEX IF NOT EXISTS votes_day ON votes (day)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS votes_visitor ON votes (visitor)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS wins (month TEXT PRIMARY KEY, realm TEXT NOT NULL, at INTEGER NOT NULL)`);
  }
  get(day: string, visitor: string) {
    const row = this.sql.exec<{ realm: string }>(`SELECT realm FROM votes WHERE day = ? AND visitor = ?`, day, visitor).toArray()[0];
    return row ? { realm: row.realm } : null;
  }
  put(day: string, visitor: string, realm: string, at: number) {
    this.sql.exec(`INSERT OR IGNORE INTO votes (day, visitor, realm, at) VALUES (?, ?, ?, ?)`, day, visitor, realm, at);
  }
  countByRealm(month: string) {
    const out: Record<string, number> = {};
    for (const row of this.sql.exec<{ realm: string; n: number }>(`SELECT realm, COUNT(*) AS n FROM votes WHERE day LIKE ? GROUP BY realm`, `${month}-%`).toArray()) out[row.realm] = row.n;
    return out;
  }
  countOf(visitor: string) {
    return this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM votes WHERE visitor = ?`, visitor).one().n;
  }
  wins() {
    const out: Record<string, number> = {};
    for (const row of this.sql.exec<{ realm: string; n: number }>(`SELECT realm, COUNT(*) AS n FROM wins GROUP BY realm`).toArray()) out[row.realm] = row.n;
    return out;
  }
  winOf(month: string) {
    return this.sql.exec<{ realm: string }>(`SELECT realm FROM wins WHERE month = ?`, month).toArray()[0]?.realm ?? null;
  }
  recordWin(month: string, realm: string, at: number) {
    this.sql.exec(`INSERT OR IGNORE INTO wins (month, realm, at) VALUES (?, ?, ?)`, month, realm, at);
  }
}

export class VoteLedger extends DurableObject<Env> {
  private readonly ledger: Ledger;
  private readonly tickets: TicketBook;
  private readonly tz: string;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.tz = env.PARK_TZ || 'America/New_York';
    this.ledger = new Ledger(new SqlVoteStore(ctx.storage.sql), VOTABLE_REALMS);
    this.tickets = new TicketBook(new SqlTicketStore(ctx.storage.sql));
  }

  /** Internal API, called by the Worker with the visitor already authenticated and admitted. */
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const now = new Date();
    const day = parkDay(now, this.tz);
    if (url.pathname.startsWith('/tickets/')) {
      // A ticket votes as itself: its votes, and whether today's is spent.
      return ticketDesk(this.tickets, request, now.getTime(), (id) => ({ cast: this.ledger.castBy(id), today: this.ledger.status(id, day).votedFor !== null }));
    }
    if (url.pathname === '/vote' && request.method === 'POST') {
      const body = (await request.json()) as { visitor?: string; realm?: string };
      if (typeof body.visitor !== 'string' || typeof body.realm !== 'string') return Response.json({ error: 'bad request' }, { status: 400 });
      const result = this.ledger.vote(body.visitor, body.realm, day, now.getTime());
      return Response.json({ ...result, day });
    }
    if (url.pathname === '/status') {
      const visitor = url.searchParams.get('visitor') ?? '';
      return Response.json(this.ledger.status(visitor, day));
    }
    if (url.pathname === '/tally') {
      const month = url.searchParams.get('month') ?? parkMonth(now, this.tz);
      return Response.json(this.ledger.tally(month));
    }
    if (url.pathname === '/close' && request.method === 'POST') {
      const month = url.searchParams.get('month') ?? previousMonth(parkMonth(now, this.tz));
      return Response.json(this.ledger.close(month, now.getTime()));
    }
    return new Response('not found', { status: 404 });
  }
}

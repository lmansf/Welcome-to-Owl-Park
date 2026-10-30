/**
 * The Realm Vote's SQLite tables, kept in the vote ledger's Durable Object beside the tickets. Apart
 * from the object class so tests run it against any SQLite with the same `exec(query, ...bindings)`
 * shape. A vote row names its voter (a wallet, C42) and the ticket that let the owl in.
 */
import { errorFields } from '@owl-park/shared';
import type { VoteStore } from './Ledger';
import { moduleLog } from './logs';

export class SqlVoteStore implements VoteStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS votes (day TEXT NOT NULL, visitor TEXT NOT NULL, realm TEXT NOT NULL, at INTEGER NOT NULL, ticket TEXT, PRIMARY KEY (day, visitor))`);
    // A table kept before wallets counted (C42) has no ticket column: add it (once there, SQLite refuses a second one).
    try {
      sql.exec(`ALTER TABLE votes ADD COLUMN ticket TEXT`);
    } catch (e) {
      // Already there; anything else is worth a line.
      if (!/duplicate column/i.test(errorFields(e).message)) moduleLog.error('worker.tickets', 'write_failed', 'A table could not be brought up to date.', { table: 'votes', column: 'ticket', error: e });
    }
    sql.exec(`CREATE INDEX IF NOT EXISTS votes_day ON votes (day)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS votes_visitor ON votes (visitor)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS votes_ticket ON votes (ticket)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS wins (month TEXT PRIMARY KEY, realm TEXT NOT NULL, at INTEGER NOT NULL)`);
  }
  get(day: string, visitor: string) {
    const row = this.sql.exec<{ realm: string }>(`SELECT realm FROM votes WHERE day = ? AND visitor = ?`, day, visitor).toArray()[0];
    return row ? { realm: row.realm } : null;
  }
  getByTicket(day: string, ticket: string) {
    // Votes from before wallets counted (C35) were kept under the ticket itself.
    const row = this.sql.exec<{ realm: string }>(`SELECT realm FROM votes WHERE day = ? AND (ticket = ? OR visitor = ?) LIMIT 1`, day, ticket, ticket).toArray()[0];
    return row ? { realm: row.realm } : null;
  }
  put(day: string, visitor: string, realm: string, at: number, ticket: string | null) {
    this.sql.exec(`INSERT OR IGNORE INTO votes (day, visitor, realm, at, ticket) VALUES (?, ?, ?, ?, ?)`, day, visitor, realm, at, ticket);
  }
  countByRealm(month: string) {
    const out: Record<string, number> = {};
    for (const row of this.sql.exec<{ realm: string; n: number }>(`SELECT realm, COUNT(*) AS n FROM votes WHERE day LIKE ? GROUP BY realm`, `${month}-%`).toArray()) out[row.realm] = row.n;
    return out;
  }
  countOf(ticket: string) {
    return this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM votes WHERE ticket = ? OR visitor = ?`, ticket, ticket).one().n;
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

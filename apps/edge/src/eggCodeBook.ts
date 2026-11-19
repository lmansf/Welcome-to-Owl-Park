/**
 * Egg codes (OP-260), in the Collections object's SQLite beside the collections: the id of every code
 * the park has taken, with the owl that took it, so a code works once in the whole park. Only the id is
 * kept, never the code itself. Written without platform APIs beyond `SqlStorage`, so Node tests it.
 */
import type { EggCodeLedger } from '@owl-park/shared';

export class EggCodeBook implements EggCodeLedger {
  constructor(private readonly sql: SqlStorage) {
    sql.exec('CREATE TABLE IF NOT EXISTS redeemed_codes (id TEXT PRIMARY KEY, cid TEXT NOT NULL, at INTEGER NOT NULL)');
  }

  taken(id: string): boolean {
    return this.sql.exec('SELECT 1 FROM redeemed_codes WHERE id = ?', id).toArray().length > 0;
  }

  take(id: string, cid: string, at: number): void {
    this.sql.exec('INSERT OR IGNORE INTO redeemed_codes (id, cid, at) VALUES (?, ?, ?)', id, cid, at);
  }
}

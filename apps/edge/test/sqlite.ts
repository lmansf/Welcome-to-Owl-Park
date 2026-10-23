/**
 * Node's built-in SQLite stands in for a Durable Object's in the tests: same engine, same SQL. Only
 * the slice of `SqlStorage` the stores use is here: `exec(query, ...bindings)`, its `toArray()`,
 * `one()` and `rowsWritten`.
 */
interface Statement {
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number | bigint };
}
type Database = new (path: string) => { prepare(sql: string): Statement };

// Not a typed import: the edge package compiles without Node's types.
const { DatabaseSync } = (await import('node:sqlite' as string)) as { DatabaseSync: Database };

/** Statements that answer with rows. */
const READS = /^\s*(SELECT|EXPLAIN|WITH|PRAGMA)\b/i;

/** A fresh database in memory. */
export function sqlStorage(): SqlStorage {
  const db = new DatabaseSync(':memory:');
  return {
    exec(query: string, ...bindings: unknown[]) {
      const st = db.prepare(query);
      if (READS.test(query)) {
        const rows = st.all(...bindings);
        const one = () => {
          // As the Durable Object's cursor: exactly one row, or an error.
          if (rows.length !== 1) throw new Error(`Expected exactly one result from SQL query, but got ${rows.length}.`);
          return rows[0];
        };
        return { toArray: () => rows, one, rowsWritten: 0 };
      }
      return { toArray: () => [], rowsWritten: Number(st.run(...bindings).changes) };
    },
  } as unknown as SqlStorage;
}

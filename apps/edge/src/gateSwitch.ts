/**
 * The opening switch (OP-067): the keepers flip the front gate between open (everyone through the
 * turnstiles) and taking tickets, with the admin key and no deploy. The setting lives in the vote
 * ledger's object beside the tickets (`GateSetting`); the Worker reads it through that object and
 * keeps what it read for a few seconds (`gateNow`), so a flip reaches every visitor within that.
 * With the switch never used, or cleared, GATE in wrangler.jsonc decides as before.
 */
import { gateMode, type Gate, type GateMode } from './gate';
import { moduleLog } from './logs';

/** How long a Worker keeps what it read of the switch: a flip reaches everyone within this. */
export const GATE_KEEP_MS = 10_000;

/** The switch as set: the mode and when it was set (ms); null when it was never set, or cleared. */
export type GateSet = { mode: GateMode; at: number } | null;

/** The setting in the vote ledger's SQLite. */
export class GateSetting {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS park_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, at INTEGER NOT NULL)`);
  }

  get(): GateSet {
    const r = this.sql.exec<{ value: string; at: number }>(`SELECT value, at FROM park_settings WHERE key = 'gate'`).toArray()[0];
    return r && (r.value === 'open' || r.value === 'ticket') ? { mode: r.value, at: r.at } : null;
  }

  /** Sets the mode (kept as it was, with its time, when it is already that), or clears it with null. */
  set(mode: GateMode | null, now: number): GateSet {
    if (mode === null) {
      this.sql.exec(`DELETE FROM park_settings WHERE key = 'gate'`);
      return null;
    }
    const known = this.get();
    if (known?.mode === mode) return known;
    this.sql.exec(`INSERT OR REPLACE INTO park_settings (key, value, at) VALUES ('gate', ?, ?)`, mode, now);
    return { mode, at: now };
  }
}

/** The gate from the switch, or from GATE where the switch was never set. */
export function gateFrom(set: GateSet, deployed: string | undefined): Gate {
  if (!set) return { mode: gateMode(deployed), closedAt: null };
  return { mode: set.mode, closedAt: set.mode === 'ticket' ? set.at : null };
}

let kept: { gate: Gate; until: number } | null = null;

/**
 * The gate now, as the Worker serves it: read from the switch at most every few seconds. When the
 * ledger cannot be reached, the last answer stands (GATE before the first).
 */
export async function gateNow(read: () => Promise<GateSet>, deployed: string | undefined, now = Date.now()): Promise<Gate> {
  if (kept && now < kept.until) return kept.gate;
  try {
    const gate = gateFrom(await read(), deployed);
    kept = { gate, until: now + GATE_KEEP_MS };
    return gate;
  } catch (e) {
    moduleLog.error('worker.admin', 'read_failed', 'The opening switch could not be read: the last answer stands (GATE before the first).', { error: e });
    const gate = kept?.gate ?? gateFrom(null, deployed);
    kept = { gate, until: now + GATE_KEEP_MS };
    return gate;
  }
}

/** Forget what was read, so the next look reads the switch (after a flip here, and in tests). */
export function forgetGate(): void {
  kept = null;
}

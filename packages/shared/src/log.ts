/**
 * Structured logging for the Worker and the room server (OP-134): one JSON object per line, so a
 * chaos run (OP-132) or a keeper can answer "what happened" from the logs alone. Every line has the
 * time, the level, the component (a fixed list), the event (a fixed list of snake_case names) and a
 * plain sentence; optional fields add the chaos run, the session, the room, hashed ids, a duration,
 * a reason and an error's name and message (never its stack).
 *
 * A log never carries a person's details: a field named for one (an email, a name, a token, a
 * ticket or an order id) is dropped from the line, and a warning line says which field and from
 * which event, so the call can be fixed. Ids that link lines together go in hashed (hashForLog).
 */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Who logs: the Worker's routes, the room objects, the collections object, the line, the page. */
export const LOG_COMPONENTS = [
  'worker',
  'worker.pass',
  'worker.store',
  'worker.tickets',
  'worker.admin',
  'worker.accounts',
  'worker.health',
  'worker.feedback',
  'worker.fraud',
  'worker.guard',
  'room.join',
  'room.leave',
  'room.queue',
  'room.tick',
  'room.emote',
  'room.move',
  'room.rest',
  'room.realms',
  'room.nest',
  'room.play',
  'collections',
  'collections.log',
  'collections.travel',
  'collections.climb',
  'overflow',
  'client.net',
] as const;
export type LogComponent = (typeof LOG_COMPONENTS)[number];

/** Every event a line can be (docs/LOGGING.md lists each with its fields). */
export const LOG_EVENTS = [
  'log_field_refused',
  'signing_key_missing',
  'pass_issued',
  'pass_verified',
  'pass_rejected',
  'claim_moved',
  'room_join_ok',
  'room_join_refused',
  'room_leave',
  'reconnect_ok',
  'queue_enter',
  'queue_admit',
  'queue_depth',
  'tick_latency_p95',
  'emote_throttled',
  'position_rejected',
  'webhook_received',
  'webhook_rejected',
  'webhook_duplicate',
  'webhook_failed',
  'order_recorded',
  'store_unreachable',
  'admin_denied',
  'admin_ok',
  'request_refused',
  'rate_limited',
  'csp_violation',
  'gate_switched',
  'capacity_set',
  'realms_set',
  'collect_logged',
  'collect_log_failed',
  'collect_log_retried',
  'collect_log_full',
  'collect_log_dropped',
  'afk_sleep',
  'afk_leave',
  'gate_crossed',
  'gate_flag_cleared',
  'health_check',
  'climb_band_refused',
  'read_failed',
  'write_failed',
  'send_failed',
  'unhandled_error',
  'fraud_scored',
  'fraud_timeout',
  'fraud_fail_open',
  'fraud_restored',
] as const;
export type LogEvent = (typeof LOG_EVENTS)[number];

/** Events kept for code not in the park yet: the fraud link (OP-053) logs these once it is built in. */
export const RESERVED_LOG_EVENTS: readonly LogEvent[] = ['fraud_scored', 'fraud_timeout', 'fraud_fail_open', 'fraud_restored'];

/** Events the logger raises itself (its privacy refusal): its own tests fire each, not the Worker's. */
export const LOGGER_EVENTS: readonly LogEvent[] = ['log_field_refused'];

/** Field names a line refuses: they could carry a person's details. */
export const REFUSED_FIELDS: readonly string[] = ['email', 'name', 'token', 'ticket_id', 'order_id'];

/** What a line may carry besides its time, level, component, event and sentence. */
export interface LogFields {
  /** The chaos run (the X-Chaos-Run header, OP-132), echoed by the room server. */
  run_id?: string;
  session_id?: string;
  room?: string;
  collector_hash?: string;
  order_hash?: string;
  duration_ms?: number;
  reason?: string;
  error?: unknown;
  [key: string]: unknown;
}

export interface LogLine {
  ts: string;
  level: LogLevel;
  component: LogComponent;
  event: LogEvent;
  msg: string;
  [key: string]: unknown;
}

export type LogSink = (level: LogLevel, line: string) => void;

export interface Logger {
  debug(component: LogComponent, event: LogEvent, msg: string, fields?: LogFields): void;
  info(component: LogComponent, event: LogEvent, msg: string, fields?: LogFields): void;
  warn(component: LogComponent, event: LogEvent, msg: string, fields?: LogFields): void;
  error(component: LogComponent, event: LogEvent, msg: string, fields?: LogFields): void;
  /** A logger whose every line also carries these fields (a chaos run's id, a room). */
  with(fields: LogFields): Logger;
}

/** The platform's console, at each line's level: Workers Logs keep the level. */
export const consoleSink: LogSink = (level, line) => {
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (level === 'debug') console.debug(line);
  else console.log(line);
};

/** An error's name and message, never its stack; anything thrown that is not an Error, as words. */
export function errorFields(e: unknown): { name: string; message: string } {
  if (e instanceof Error) return { name: e.name, message: e.message };
  return { name: 'Error', message: typeof e === 'string' ? e : String(e) };
}

/**
 * A short id for linking lines (14 hex digits; cyrb53), never the value it stands for: a collector
 * token, an order, a pass. Not a secret-keeping hash: what goes in must be long and random already.
 */
export function hashForLog(raw: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** The level a deployment asks for (its LOG_LEVEL), or info. */
export function logLevelOf(v: unknown): LogLevel {
  return typeof v === 'string' && (LOG_LEVELS as readonly string[]).includes(v) ? (v as LogLevel) : 'info';
}

export function createLogger(opts: { sink?: LogSink; level?: LogLevel; now?: () => number; base?: LogFields } = {}): Logger {
  const sink = opts.sink ?? consoleSink;
  const min = RANK[opts.level ?? 'info'];
  const now = opts.now ?? (() => Date.now());
  const base = opts.base ?? {};
  const write = (level: LogLevel, component: LogComponent, event: LogEvent, msg: string, fields?: LogFields): void => {
    if (RANK[level] < min) return;
    const ts = new Date(now()).toISOString();
    const line: LogLine = { ts, level, component, event, msg };
    const refused: string[] = [];
    for (const [key, value] of Object.entries({ ...base, ...fields })) {
      if (value === undefined) continue;
      if (REFUSED_FIELDS.includes(key.toLowerCase())) refused.push(key);
      else line[key] = key === 'error' ? errorFields(value) : value;
    }
    sink(level, JSON.stringify(line));
    for (const field of refused) {
      sink('warn', JSON.stringify({ ts, level: 'warn', component, event: 'log_field_refused', msg: 'A field that could carry a person’s details was left out of a log line.', field, of: event } satisfies LogLine));
    }
  };
  const make = (extra: LogFields): Logger => ({
    debug: (c, e, m, f) => write('debug', c, e, m, { ...extra, ...f }),
    info: (c, e, m, f) => write('info', c, e, m, { ...extra, ...f }),
    warn: (c, e, m, f) => write('warn', c, e, m, { ...extra, ...f }),
    error: (c, e, m, f) => write('error', c, e, m, { ...extra, ...f }),
    with: (more) => make({ ...extra, ...more }),
  });
  return make({});
}

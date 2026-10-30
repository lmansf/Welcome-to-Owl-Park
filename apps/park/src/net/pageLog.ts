/**
 * The page's own log (OP-134), off unless its address asks for it: with `?log=1` (or a level, such as
 * `?log=debug`) the room connection writes the shared logger's one JSON line per event to the console,
 * so the chaos harness's scripted pages (OP-132) are read like the Worker and the room server, and
 * `?run=<id>` puts the run's id on every line. Without it the page writes nothing new; its console
 * stays as it was.
 *
 * TODO-DOCS (OP-134): docs/LOGGING.md: the page's lines (client.net: room_join_ok, reconnect_ok with
 * gap_ms, room_join_refused and room_leave with the close code), `?log=` and `?run=`.
 */
import { createLogger, logLevelOf, type Logger } from '@owl-park/shared';

/** A chaos run's id as the harness gives it: letters, digits and dashes, short (as the Worker takes it). */
const RUN_ID = /^[A-Za-z0-9-]{1,64}$/;

/** The page's logger for an address's query string, or null when it does not ask for one. */
export function pageLoggerFrom(search: string): Logger | null {
  const q = new URLSearchParams(search);
  const flag = q.get('log');
  if (flag === null || flag === '' || flag === '0') return null;
  const log = createLogger({ level: logLevelOf(flag) });
  const run = q.get('run');
  return run && RUN_ID.test(run) ? log.with({ run_id: run }) : log;
}

/** This page's logger: null unless its address asks for one. */
export const pageLog: Logger | null = typeof location === 'undefined' ? null : pageLoggerFrom(location.search);

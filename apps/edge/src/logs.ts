/**
 * The Worker's and the room server's log (OP-134): the shared logger (packages/shared log.ts) at the
 * deployment's LOG_LEVEL, every line one JSON object on the console, where Workers Logs keep it. A
 * request that names a chaos run (OP-132's X-Chaos-Run header) has the run's id on each of its lines,
 * and a room socket opened under one keeps it on the room server's lines too.
 *
 * TODO-DOCS (OP-134): docs/LOGGING.md: the components, the events and their fields (LOG_COMPONENTS
 * and LOG_EVENTS in packages/shared/src/log.ts), LOG_LEVEL, and X-Chaos-Run as run_id. The fraud
 * events are reserved for the fraud link (OP-053). docs/agents.md, Claude Code's rules: a ticket that
 * adds an event lists it in LOG_EVENTS, fires it in a test through logged(), and adds its line to
 * docs/LOGGING.md (the ticket asks for this in Claude Code's definition of done).
 */
import { consoleSink, createLogger, logLevelOf, type LogLevel, type LogLine, type LogSink, type Logger } from '@owl-park/shared';

/** Where every line goes: the console, or a test's list (captureLogs). */
let sink: LogSink = consoleSink;
const toSink: LogSink = (level, line) => sink(level, line);

/** A chaos run's id as the harness sends it: letters, digits and dashes, short. */
const RUN_ID = /^[A-Za-z0-9-]{1,64}$/;

/** The chaos run a request belongs to (its X-Chaos-Run header), if it names one well. */
export function runIdOf(request: Request): string | undefined {
  const v = request.headers.get('X-Chaos-Run');
  return v && RUN_ID.test(v) ? v : undefined;
}

/** A logger at the deployment's level, its lines carrying the request's chaos run when it has one. */
export function loggerFor(env: { LOG_LEVEL?: string }, request?: Request): Logger {
  const log = createLogger({ sink: toSink, level: logLevelOf(env.LOG_LEVEL) });
  const run = request ? runIdOf(request) : undefined;
  return run ? log.with({ run_id: run }) : log;
}

/** For code with no deployment settings to hand (a module's own warning): info and above. */
export const moduleLog: Logger = createLogger({ sink: toSink });

/** For tests: lines are kept here, not printed, until `restore` puts the console back. */
export function captureLogs(): { lines: LogLine[]; levels: LogLevel[]; restore(): void } {
  const lines: LogLine[] = [];
  const levels: LogLevel[] = [];
  const before = sink;
  sink = (level, line) => {
    levels.push(level);
    lines.push(JSON.parse(line) as LogLine);
  };
  return { lines, levels, restore: () => void (sink = before) };
}

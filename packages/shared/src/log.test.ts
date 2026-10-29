import { describe, expect, it } from 'vitest';
import { LOG_COMPONENTS, LOG_EVENTS, createLogger, errorFields, hashForLog, logLevelOf, type LogLevel } from './log';

const T0 = Date.UTC(2026, 9, 29, 18, 0, 0);

function captured(level: LogLevel = 'info') {
  const lines: Array<{ level: LogLevel; line: Record<string, unknown> }> = [];
  const log = createLogger({ level, now: () => T0, sink: (l, text) => lines.push({ level: l, line: JSON.parse(text) as Record<string, unknown> }) });
  return { log, lines };
}

describe('structured logging (OP-134)', () => {
  it('writes one JSON object per line: time, level, component, event, sentence, and the fields given', () => {
    const { log, lines } = captured();
    log.info('room.join', 'room_join_ok', 'An owl came into the room.', { room: 'hub', duration_ms: 12 });
    expect(lines).toEqual([{ level: 'info', line: { ts: '2026-10-29T18:00:00.000Z', level: 'info', component: 'room.join', event: 'room_join_ok', msg: 'An owl came into the room.', room: 'hub', duration_ms: 12 } }]);
  });

  it('keeps debug lines out unless the deployment asks for them', () => {
    const quiet = captured('info');
    quiet.log.debug('room.tick', 'tick_latency_p95', 'Frames took this long.');
    expect(quiet.lines).toEqual([]);
    const loud = captured('debug');
    loud.log.debug('room.tick', 'tick_latency_p95', 'Frames took this long.');
    expect(loud.lines).toHaveLength(1);
    expect(logLevelOf('debug')).toBe('debug');
    expect(logLevelOf('loud')).toBe('info');
    expect(logLevelOf(undefined)).toBe('info');
  });

  it('never writes a person’s details: the field is dropped and a warning names it', () => {
    const { log, lines } = captured();
    log.info('worker.store', 'order_recorded', 'An order was kept.', { email: 'grown.up@family.test', Name: 'Someone', token: 't', ticket_id: 'OWL-1', order_id: '9', order_hash: hashForLog('9') });
    expect(lines[0]!.line).toEqual({ ts: '2026-10-29T18:00:00.000Z', level: 'info', component: 'worker.store', event: 'order_recorded', msg: 'An order was kept.', order_hash: hashForLog('9') });
    expect(lines.slice(1).map((l) => [l.level, l.line['event'], l.line['field'], l.line['of']])).toEqual([
      ['warn', 'log_field_refused', 'email', 'order_recorded'],
      ['warn', 'log_field_refused', 'Name', 'order_recorded'],
      ['warn', 'log_field_refused', 'token', 'order_recorded'],
      ['warn', 'log_field_refused', 'ticket_id', 'order_recorded'],
      ['warn', 'log_field_refused', 'order_id', 'order_recorded'],
    ]);
    expect(JSON.stringify(lines)).not.toContain('grown.up@family.test');
  });

  it('writes an error as its name and message, never its stack', () => {
    const { log, lines } = captured();
    const e = new TypeError('the store did not answer');
    log.error('worker.store', 'store_unreachable', 'The store could not be reached.', { error: e });
    expect(lines[0]!.line['error']).toEqual({ name: 'TypeError', message: 'the store did not answer' });
    expect(JSON.stringify(lines[0]!.line)).not.toContain('at ');
    expect(errorFields('plain words')).toEqual({ name: 'Error', message: 'plain words' });
  });

  it('carries a chaos run’s id and a room on every line of a logger made with them', () => {
    const { log, lines } = captured();
    const run = log.with({ run_id: 'chaos-1', room: 'hub' });
    run.warn('room.emote', 'emote_throttled', 'Emotes came faster than the room plays them.', { count: 3 });
    expect(lines[0]!.line).toMatchObject({ run_id: 'chaos-1', room: 'hub', count: 3, level: 'warn' });
  });

  it('hashes ids the same way every time, short, and not as themselves', () => {
    const token = 'c_k3x9q2abQ7';
    expect(hashForLog(token)).toBe(hashForLog(token));
    expect(hashForLog(token)).toMatch(/^[0-9a-f]{14}$/);
    expect(hashForLog(token)).not.toBe(hashForLog('c_k3x9q2abQ8'));
    expect(hashForLog(token)).not.toContain(token);
  });

  it('names its components and events in snake case, once each', () => {
    for (const c of LOG_COMPONENTS) expect(c).toMatch(/^(worker|room|collections|overflow|client)(\.[a-z]+)?$/);
    for (const e of LOG_EVENTS) expect(e).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
    expect(new Set(LOG_EVENTS).size).toBe(LOG_EVENTS.length);
  });
});

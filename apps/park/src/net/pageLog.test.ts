import { describe, expect, it } from 'vitest';
import { pageLoggerFrom } from './pageLog';

describe('the page’s own log (OP-134)', () => {
  it('is off unless the address asks for it', () => {
    expect(pageLoggerFrom('')).toBeNull();
    expect(pageLoggerFrom('?log=0')).toBeNull();
    expect(pageLoggerFrom('?log=')).toBeNull();
    expect(pageLoggerFrom('?log=1')).not.toBeNull();
    expect(pageLoggerFrom('?local=1&log=debug')).not.toBeNull();
  });

  it('writes one JSON line per event, with the chaos run’s id when the address names one well', () => {
    const lines: string[] = [];
    const before = console.log;
    console.log = (line: string) => void lines.push(line);
    try {
      pageLoggerFrom('?log=1&run=chaos-7')!.info('client.net', 'reconnect_ok', 'Back.', { room: 'hub', gap_ms: 1200 });
      pageLoggerFrom('?log=1&run=not%20a%20run')!.info('client.net', 'room_join_ok', 'In.', { room: 'hub' });
      pageLoggerFrom('?log=warn')!.info('client.net', 'room_leave', 'Gone.', { room: 'hub' });
    } finally {
      console.log = before;
    }
    expect(lines.map((l) => JSON.parse(l) as Record<string, unknown>)).toEqual([
      expect.objectContaining({ level: 'info', component: 'client.net', event: 'reconnect_ok', run_id: 'chaos-7', room: 'hub', gap_ms: 1200 }),
      expect.not.objectContaining({ run_id: expect.anything() }),
    ]);
  });
});

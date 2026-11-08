import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetGate, GATE_KEEP_MS, gateFrom, gateNow, GateSetting, type GateRead, type GateSet } from '../src/gateSwitch';
import { sqlStorage } from './sqlite';

const T0 = Date.UTC(2026, 11, 1, 14, 0);

afterEach(() => {
  forgetGate();
  vi.restoreAllMocks();
});

describe('the opening switch (OP-067): the setting', () => {
  it('is unset at first, then keeps the mode and when it was set; the same mode again keeps its time', () => {
    const sql = sqlStorage();
    const s = new GateSetting(sql);
    expect(s.get()).toBeNull();
    expect(s.set('ticket', T0)).toEqual({ mode: 'ticket', at: T0 });
    expect(s.set('ticket', T0 + 5_000)).toEqual({ mode: 'ticket', at: T0 });
    expect(s.set('open', T0 + 9_000)).toEqual({ mode: 'open', at: T0 + 9_000 });
    // The object wakes later with the table as it was.
    expect(new GateSetting(sql).get()).toEqual({ mode: 'open', at: T0 + 9_000 });
    expect(s.set(null, T0 + 10_000)).toBeNull();
    expect(s.get()).toBeNull();
  });

  it('decides the gate when set, and leaves it to GATE when not', () => {
    expect(gateFrom(null, 'ticket')).toEqual({ mode: 'ticket', closedAt: null, restartAt: null });
    expect(gateFrom(null, undefined)).toEqual({ mode: 'open', closedAt: null, restartAt: null });
    expect(gateFrom({ mode: 'ticket', at: T0 }, 'open')).toEqual({ mode: 'ticket', closedAt: T0, restartAt: null });
    expect(gateFrom({ mode: 'open', at: T0 }, 'ticket')).toEqual({ mode: 'open', closedAt: null, restartAt: null });
    // The last nightly restart goes with it, whatever the gate (OP-181).
    expect(gateFrom(null, 'ticket', T0 + 1)).toEqual({ mode: 'ticket', closedAt: null, restartAt: T0 + 1 });
  });

  it('keeps when the park last restarted beside the switch, the latest only, and leaves the switch as it was (OP-181)', () => {
    const sql = sqlStorage();
    const s = new GateSetting(sql);
    expect(s.restartAt()).toBeNull();
    s.set('ticket', T0);
    expect(s.restart(T0 + 1_000)).toBe(T0 + 1_000);
    expect(s.restart(T0 + 2_000)).toBe(T0 + 2_000);
    expect(new GateSetting(sql).restartAt()).toBe(T0 + 2_000);
    expect(s.get()).toEqual({ mode: 'ticket', at: T0 });
    // Clearing the switch keeps the restart.
    s.set(null, T0 + 3_000);
    expect(s.restartAt()).toBe(T0 + 2_000);
  });
});

describe('the opening switch (OP-067): the Worker reading it', () => {
  it('reads the switch at most every few seconds, so a flip reaches everyone within that', async () => {
    let set: GateSet = null;
    let restartAt: number | null = null;
    const read = vi.fn(async (): Promise<GateRead> => ({ set, restartAt }));
    expect(await gateNow(read, 'open', T0)).toEqual({ mode: 'open', closedAt: null, restartAt: null });
    set = { mode: 'ticket', at: T0 + 1 };
    restartAt = T0 + 2;
    expect(await gateNow(read, 'open', T0 + GATE_KEEP_MS - 1)).toEqual({ mode: 'open', closedAt: null, restartAt: null });
    expect(read).toHaveBeenCalledTimes(1);
    expect(await gateNow(read, 'open', T0 + GATE_KEEP_MS)).toEqual({ mode: 'ticket', closedAt: T0 + 1, restartAt: T0 + 2 });
    // A flip made through this Worker is read at once.
    set = { mode: 'open', at: T0 + 2 };
    forgetGate();
    expect((await gateNow(read, 'open', T0 + GATE_KEEP_MS + 1)).mode).toBe('open');
  });

  it('keeps the last answer when the ledger cannot be reached, and GATE before any', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const down = vi.fn(async (): Promise<GateRead> => {
      throw new Error('the ledger is away');
    });
    expect(await gateNow(down, 'ticket', T0)).toEqual({ mode: 'ticket', closedAt: null, restartAt: null });
    forgetGate();
    expect(await gateNow(async () => ({ set: { mode: 'ticket', at: T0 }, restartAt: T0 - 5 }), 'open', T0)).toEqual({ mode: 'ticket', closedAt: T0, restartAt: T0 - 5 });
    expect(await gateNow(down, 'open', T0 + GATE_KEEP_MS)).toEqual({ mode: 'ticket', closedAt: T0, restartAt: T0 - 5 });
  });
});

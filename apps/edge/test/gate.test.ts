import { describe, expect, it } from 'vitest';
import { WAY_OUT_DOOR } from '@owl-park/shared';
import { ROOMS } from '@owl-park/shared/rooms';
import { LOBBY, admitted, beforeRestart, gateMode, isFreeRoom, mayEnter } from '../src/gate';

describe('the front gate', () => {
  it('reads GATE: only "ticket" takes tickets', () => {
    expect(gateMode('ticket')).toBe('ticket');
    expect(gateMode('open')).toBe('open');
    expect(gateMode(undefined)).toBe('open');
    expect(gateMode('Ticket')).toBe('open');
  });

  it('lets every pass into every room while the gate is open', () => {
    for (const room of [LOBBY, 'hub', 'grove', 'market']) expect(mayEnter('open', { adm: false }, room)).toBe(true);
  });

  it('keeps a pass without a ticket in the lobby once the gate takes tickets', () => {
    expect(mayEnter('ticket', { adm: false }, LOBBY)).toBe(true);
    for (const room of ['hub', 'grove', 'market']) expect(mayEnter('ticket', { adm: false }, room)).toBe(false);
    for (const room of [LOBBY, 'hub', 'grove', 'market']) expect(mayEnter('ticket', { adm: true }, room)).toBe(true);
  });

  it('lets a pass without a ticket onto the street of nests and into any nest, which are outside the turnstiles', () => {
    for (const room of ['homes', 'nest-abcd1234', 'nest-00000000']) {
      expect(isFreeRoom(room), room).toBe(true);
      expect(mayEnter('ticket', { adm: false }, room), room).toBe(true);
    }
    // Only well-formed nest ids, and never the park's rooms inside the turnstiles.
    for (const room of ['nest-ABCD1234', 'nest-abc', 'nest-abcd12345', 'nest-', 'nest', 'nests', 'homes-west', 'hub', 'grove', 'market', 'xnest-abcd1234']) {
      expect(isFreeRoom(room), room).toBe(false);
      expect(mayEnter('ticket', { adm: false }, room), room).toBe(false);
    }
  });

  it('keeps the way out of the park open to everyone, and lets a ticket holder who left come back in', () => {
    const wayOut = ROOMS['hub']!.doors.find((d) => d.id === WAY_OUT_DOOR)!;
    expect(wayOut.to?.room).toBe(LOBBY);
    expect(mayEnter('ticket', { adm: false }, wayOut.to!.room)).toBe(true);
    // Leaving changes nothing on the pass the turnstiles admitted: it opens the park again.
    expect(mayEnter('ticket', { adm: true }, 'hub')).toBe(true);
    expect(mayEnter('ticket', { adm: false }, 'hub')).toBe(false);
  });

  it('admits everyone while the gate is open, and only ticket-holders once it takes tickets', () => {
    expect(admitted('open', { adm: false })).toBe(true);
    expect(admitted('ticket', { adm: false })).toBe(false);
    expect(admitted('ticket', { adm: true })).toBe(true);
  });

  it('keeps an owl inside when the switch closes the gate: a pass from before then stays admitted', () => {
    const closedAt = Date.UTC(2026, 11, 1, 14, 0);
    const gate = { mode: 'ticket' as const, closedAt, restartAt: null };
    const before = { adm: false, iat: closedAt / 1000 - 60 };
    const after = { adm: false, iat: closedAt / 1000 + 1 };
    expect(admitted(gate, before)).toBe(true);
    expect(mayEnter(gate, before, 'market')).toBe(true);
    expect(admitted(gate, after)).toBe(false);
    expect(mayEnter(gate, after, 'market')).toBe(false);
    expect(mayEnter(gate, after, LOBBY)).toBe(true);
    // A pass that does not say when it was made, or a gate deployed closed, keeps no one in.
    expect(admitted(gate, { adm: false })).toBe(false);
    expect(admitted({ mode: 'ticket', closedAt: null, restartAt: null }, before)).toBe(false);
    expect(admitted({ mode: 'open', closedAt: null, restartAt: null }, after)).toBe(true);
  });

  describe('after the park’s nightly restart (OP-181)', () => {
    const restartAt = Date.UTC(2026, 10, 2, 9, 0, 0, 250);
    const s = (ms: number) => Math.floor(ms / 1000);
    const ticket = { mode: 'ticket' as const, closedAt: null, restartAt };

    it('refuses a pass the turnstiles admitted before the restart, past them and for the shop, and keeps the free rooms open to it', () => {
      const old = { adm: true, iat: s(restartAt) - 3_600 };
      expect(beforeRestart(ticket, old)).toBe(true);
      expect(admitted(ticket, old)).toBe(false);
      for (const room of ['hub', 'grove', 'market']) expect(mayEnter(ticket, old, room), room).toBe(false);
      expect(mayEnter(ticket, old, LOBBY)).toBe(true);
      // Made in the restart's own second: the owl scans once more, never the other way round.
      expect(admitted(ticket, { adm: true, iat: s(restartAt) })).toBe(false);
      // A pass that does not say when it was made is from before.
      expect(admitted(ticket, { adm: true })).toBe(false);
    });

    it('takes a pass the turnstiles admit after it', () => {
      const fresh = { adm: true, iat: s(restartAt) + 1 };
      expect(beforeRestart(ticket, fresh)).toBe(false);
      expect(admitted(ticket, fresh)).toBe(true);
      expect(mayEnter(ticket, fresh, 'hub')).toBe(true);
      // A guest pass made after it is a guest still.
      expect(admitted(ticket, { adm: false, iat: s(restartAt) + 1 })).toBe(false);
    });

    it('keeps no owl in on the switch closing before the restart, and one in on it closing after', () => {
      const guest = { adm: false, iat: s(restartAt) + 60 };
      expect(admitted({ mode: 'ticket', closedAt: restartAt - 60_000, restartAt }, { adm: false, iat: s(restartAt) - 120 })).toBe(false);
      expect(admitted({ mode: 'ticket', closedAt: restartAt + 120_000, restartAt }, guest)).toBe(true);
    });

    it('changes nothing while the gate is open', () => {
      const open = { mode: 'open' as const, closedAt: null, restartAt };
      for (const pass of [{ adm: true, iat: s(restartAt) - 3_600 }, { adm: false, iat: s(restartAt) - 3_600 }, { adm: false }]) {
        expect(beforeRestart(open, pass)).toBe(false);
        expect(admitted(open, pass)).toBe(true);
        expect(mayEnter(open, pass, 'hub')).toBe(true);
      }
      // Nor before the first restart.
      expect(admitted({ mode: 'ticket', closedAt: null, restartAt: null }, { adm: true, iat: 1 })).toBe(true);
    });
  });
});

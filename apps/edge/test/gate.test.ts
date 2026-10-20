import { describe, expect, it } from 'vitest';
import { LOBBY, admitted, gateMode, mayEnter } from '../src/gate';

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

  it('admits everyone while the gate is open, and only ticket-holders once it takes tickets', () => {
    expect(admitted('open', { adm: false })).toBe(true);
    expect(admitted('ticket', { adm: false })).toBe(false);
    expect(admitted('ticket', { adm: true })).toBe(true);
  });
});

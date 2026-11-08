import { describe, expect, it } from 'vitest';
import { TravelBook } from '../src/travelBook';
import { sqlStorage } from './sqlite';

const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);
const OWL = 'c_owlAAAAAAAA';
const OTHER = 'c_owlBBBBBBBB';

describe('travel from the map in the collections object (OP-130)', () => {
  it('keeps the places an owl walks into, in the order it first did, and not nests or rooms the map has no place for', () => {
    const b = new TravelBook(sqlStorage());
    expect(b.state(OWL)).toEqual({ places: [], gate: false });
    b.entered(OWL, 'nest-k3x9q2ab', 'mirror', T0);
    b.entered(OWL, 'homes', 'from-nest-0', T0 + 1);
    b.entered(OWL, 'lobby', 'from-homes', T0 + 2);
    b.entered(OWL, 'hub', 'default', T0 + 3);
    b.entered(OWL, 'grove', 'default', T0 + 4);
    b.entered(OWL, 'hub', 'from-grove', T0 + 5);
    b.entered(OWL, 'no-such-room', undefined, T0 + 6);
    expect(b.state(OWL).places).toEqual(['homes', 'lobby', 'hub', 'grove']);
    // Another owl's map is its own.
    expect(b.state(OTHER)).toEqual({ places: [], gate: false });
  });

  it('has the owl through the gate from the turnstiles on, whatever it does inside, until it is outside again', () => {
    const b = new TravelBook(sqlStorage());
    b.entered(OWL, 'lobby', 'from-homes', T0);
    expect(b.throughGate(OWL)).toBe(false);
    // In by its address or by another room's door is not through the gate.
    b.entered(OWL, 'hub', undefined, T0 + 1);
    b.entered(OWL, 'hub', 'from-market', T0 + 2);
    expect(b.throughGate(OWL)).toBe(false);
    b.entered(OWL, 'hub', 'default', T0 + 3);
    expect(b.throughGate(OWL)).toBe(true);
    for (const [room, spawn] of [['grove', 'default'], ['hub', 'from-grove'], ['market', 'default'], ['arcade', 'from-market']] as const) {
      b.entered(OWL, room, spawn, T0 + 4);
      expect(b.throughGate(OWL), room).toBe(true);
    }
    expect(b.throughGate(OTHER)).toBe(false);
    // Outside again, by any way: the gate is walked again next time.
    for (const room of ['lobby', 'homes', 'nest-k3x9q2ab']) {
      b.entered(OWL, 'hub', 'default', T0 + 5);
      b.entered(OWL, room, 'default', T0 + 6);
      expect(b.throughGate(OWL), room).toBe(false);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { isStreetRoom, parkwardDoor } from '@owl-park/shared';
import { roomFor } from '../rooms';
import { EDGE_SIGN_IN, edgeSignAt } from './edgeSign';

describe('a sign by a doorway at the end of a room (OP-461)', () => {
  it("keeps the nests' street's To the park in from the room's east end, beside its doorway", () => {
    const homes = roomFor('homes')!;
    const door = homes.doors.find((d) => d.id === parkwardDoor('homes'))!;
    const at = edgeSignAt(homes, door);
    expect(at.west).toBe(false);
    // Its arrow end, the sign's east end, stands clear of the room's edge: the camera stops there.
    expect(at.x).toBeLessThanOrEqual(homes.size.w - EDGE_SIGN_IN);
    // And still by its doorway.
    expect(door.rect.x - at.x).toBeLessThan(EDGE_SIGN_IN);
  });

  it("keeps the Treetop Commons' To the nests in from the room's west end", () => {
    const lobby = roomFor('lobby')!;
    const door = lobby.doors.find((d) => isStreetRoom(d.to?.room))!;
    const at = edgeSignAt(lobby, door);
    expect(at.west).toBe(true);
    expect(at.x).toBeGreaterThanOrEqual(EDGE_SIGN_IN);
    expect(at.x - (door.rect.x + door.rect.w)).toBeLessThan(EDGE_SIGN_IN);
  });

  it('leaves a sign by a doorway away from the ends where it was', () => {
    const at = edgeSignAt({ size: { w: 3200, h: 900 } }, { rect: { x: 1000, y: 700, w: 100, h: 40 } });
    expect(at).toEqual({ x: 1016, y: 688, west: true });
    expect(edgeSignAt({ size: { w: 3200, h: 900 } }, { rect: { x: 2000, y: 700, w: 100, h: 40 } })).toEqual({ x: 2084, y: 688, west: false });
  });
});

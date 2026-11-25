import { describe, expect, it } from 'vitest';
import { ROOM_DOWN, roomReachable } from './roomDown';

// One line for every press that needs the park when it could not connect (OP-406, OP-407), feather tag's Start too (OP-434).
describe('the room server out of reach', () => {
  it('counts a press as reachable only with a link whose socket is not down', () => {
    expect(roomReachable(undefined)).toBe(false);
    expect(roomReachable(null)).toBe(false);
    expect(roomReachable({ online: () => false })).toBe(false);
    expect(roomReachable({ online: () => true })).toBe(true);
    // A link that cannot say (an older transport) is taken at its word, as before.
    expect(roomReachable({})).toBe(true);
  });

  it('says the park could not connect, as Play and Talk do', () => {
    expect(ROOM_DOWN).toContain('could not connect');
  });
});

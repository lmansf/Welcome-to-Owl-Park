import { describe, expect, it } from 'vitest';
import { turnPhoneShows } from './turnPhone';

// Phones play the tree on their side (OP-155 decision (d), OP-156).

const upright = { width: 412, height: 839 };
const onItsSide = { width: 839, height: 412 };

describe('the card asking to turn the phone (OP-156)', () => {
  it('shows in a room played sideways on a phone held upright, and goes once it is turned', () => {
    expect(turnPhoneShows({ sideways: true, touch: true, ...upright })).toBe(true);
    expect(turnPhoneShows({ sideways: true, touch: true, ...onItsSide })).toBe(false);
  });

  it('never shows in today’s park, on a computer, or on a tablet, however tall the screen', () => {
    expect(turnPhoneShows({ sideways: false, touch: true, ...upright })).toBe(false);
    expect(turnPhoneShows({ sideways: true, touch: false, ...upright })).toBe(false);
    expect(turnPhoneShows({ sideways: true, touch: false, width: 700, height: 1000 })).toBe(false);
    expect(turnPhoneShows({ sideways: true, touch: true, width: 768, height: 1024 })).toBe(false);
  });

  it('reads a square screen as already sideways', () => {
    expect(turnPhoneShows({ sideways: true, touch: true, width: 500, height: 500 })).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { MOVE_BURST, MOVE_REFILL_PER_S } from '@owl-park/shared';
import { MoveBudget } from './budget';

describe('MoveBudget', () => {
  it('allows a burst smaller than the server allows, then makes moves wait', () => {
    const b = new MoveBudget(0);
    let sent = 0;
    while (b.take(0)) sent += 1;
    expect(sent).toBeGreaterThan(1);
    expect(sent).toBeLessThan(MOVE_BURST);
    expect(b.wait(0)).toBeGreaterThan(0);
  });

  it('refills more slowly than the server does', () => {
    const b = new MoveBudget(0);
    while (b.take(0));
    const wait = b.wait(0);
    expect(wait).toBeGreaterThan(1000 / MOVE_REFILL_PER_S);
    expect(b.take(wait - 1)).toBe(false);
    expect(b.take(wait)).toBe(true);
  });

  it('never sends faster than the server refills, however long it runs', () => {
    const b = new MoveBudget(0);
    let sent = 0;
    for (let t = 0; t <= 60_000; t += 10) if (b.take(t)) sent += 1;
    expect(sent).toBeLessThan(MOVE_BURST + 60 * MOVE_REFILL_PER_S);
  });
});

import { describe, expect, it } from 'vitest';
import { EMOTE_EVERY_MS, MOVE_BURST, MOVE_REFILL_PER_S } from '@owl-park/shared';
import { EMOTE_SEND_EVERY_MS, EmoteGate, MoveBudget } from './budget';

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

describe('EmoteGate (OP-210)', () => {
  it('waits a little longer between emotes than the room does', () => {
    expect(EMOTE_SEND_EVERY_MS).toBeGreaterThan(EMOTE_EVERY_MS);
    expect(EMOTE_SEND_EVERY_MS - EMOTE_EVERY_MS).toBeLessThanOrEqual(250); // still feels at once to a child
  });

  it('lets the first emote go, drops the ones too soon after it, and lets one go once the spacing has passed', () => {
    const g = new EmoteGate();
    expect(g.take(10_000)).toBe(true);
    expect(g.take(10_000)).toBe(false);
    expect(g.take(10_000 + EMOTE_SEND_EVERY_MS - 1)).toBe(false);
    expect(g.take(10_000 + EMOTE_SEND_EVERY_MS)).toBe(true);
    expect(g.take(10_000 + EMOTE_SEND_EVERY_MS + 1)).toBe(false);
  });

  it('drops rather than queues: a dropped emote does not push the next one back', () => {
    const g = new EmoteGate();
    expect(g.take(0)).toBe(true);
    for (let t = 100; t < EMOTE_SEND_EVERY_MS; t += 100) expect(g.take(t)).toBe(false);
    expect(g.take(EMOTE_SEND_EVERY_MS)).toBe(true);
  });

  it('keeps a child mashing the number keys well under the room’s flood limit, and every emote it sends is one the room plays', () => {
    const g = new EmoteGate();
    const sent: number[] = [];
    // Ten keys a second for a minute, the frames arriving up to 100 ms late or early.
    for (let t = 0; t <= 60_000; t += 100) if (g.take(t)) sent.push(t);
    const jitter = (i: number) => (i % 2 === 0 ? 50 : -50);
    const arrived = sent.map((t, i) => t + jitter(i));
    let playedAt = Number.NEGATIVE_INFINITY;
    for (const at of arrived) {
      expect(at - playedAt).toBeGreaterThanOrEqual(EMOTE_EVERY_MS); // the room's own rule (Room.emote)
      playedAt = at;
    }
    // The room closes a socket after 40 frames in 5 s; emotes alone now come to a handful.
    for (const t of sent) expect(sent.filter((s) => s >= t && s < t + 5_000).length).toBeLessThanOrEqual(4);
  });
});

import { describe, expect, it } from 'vitest';
import { health } from '../src/health';

describe("the park's health (OP-068)", () => {
  it('is ok when every part answers, and names each part', async () => {
    const h = await health({ rooms: async () => 1, tickets: async () => null, collections: async () => true });
    expect(h.ok).toBe(true);
    expect(h.parts).toEqual({ rooms: true, tickets: true, collections: true });
    expect(h.ms).toBeGreaterThanOrEqual(0);
  });

  it('names the part that throws or takes too long, and waits no longer than the limit', async () => {
    const t0 = Date.now();
    const h = await health(
      {
        rooms: async () => {
          throw new Error('the rooms answered 500');
        },
        tickets: () => new Promise((r) => setTimeout(r, 5_000)),
        collections: async () => true,
      },
      50,
    );
    expect(h).toMatchObject({ ok: false, parts: { rooms: false, tickets: false, collections: true } });
    expect(Date.now() - t0).toBeLessThan(1_000);
  });

  it('counts a part that throws before it starts as down', async () => {
    const h = await health({
      rooms: () => {
        throw new Error('no stub');
      },
    });
    expect(h).toMatchObject({ ok: false, parts: { rooms: false } });
  });
});

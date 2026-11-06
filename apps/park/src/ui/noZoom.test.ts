import { describe, expect, it } from 'vitest';
import { guardZoom, zoomedIn } from './noZoom';

function page(scale: number) {
  const on = new Map<string, Array<(e: Event) => void>>();
  const writes: string[] = [];
  const tag = { content: 'width=device-width, initial-scale=1, maximum-scale=1', getAttribute: () => tag.content, setAttribute: (_n: string, v: string) => ((tag.content = v), writes.push(v)) };
  const vv = { scale, on: [] as Array<() => void>, addEventListener: (_t: string, fn: () => void) => vv.on.push(fn) };
  const doc = { addEventListener: (t: string, fn: (e: Event) => void) => on.set(t, [...(on.get(t) ?? []), fn]), querySelector: () => tag };
  const resets = guardZoom(doc, { visualViewport: vv });
  const fire = (t: string) => {
    let stopped = false;
    for (const fn of on.get(t) ?? []) fn({ preventDefault: () => (stopped = true) } as unknown as Event);
    return stopped;
  };
  return { vv, tag, writes, resets, fire };
}

describe('the page never stays zoomed on a phone', () => {
  it('reads a zoom past rounding as zoomed in', () => {
    expect(zoomedIn(1)).toBe(false);
    expect(zoomedIn(1.005)).toBe(false);
    expect(zoomedIn(1.6)).toBe(true);
    expect(zoomedIn(undefined)).toBe(false);
    expect(zoomedIn(Number.NaN)).toBe(false);
  });

  it("turns down Safari's pinch at the page", () => {
    const p = page(1);
    expect(p.fire('gesturestart')).toBe(true);
    expect(p.fire('gesturechange')).toBe(true);
  });

  it('puts a zoomed page back to its own size as the gesture ends, leaving the viewport tag as it was', () => {
    const p = page(1.8);
    p.fire('gestureend');
    expect(p.resets()).toBe(1);
    expect(p.writes[0]).toContain('minimum-scale=1');
    expect(p.tag.content).toBe('width=device-width, initial-scale=1, maximum-scale=1');
  });

  it('leaves a page at its own size alone', () => {
    const p = page(1);
    p.fire('touchend');
    for (const fn of p.vv.on) fn();
    expect(p.resets()).toBe(0);
    expect(p.writes).toEqual([]);
  });
});

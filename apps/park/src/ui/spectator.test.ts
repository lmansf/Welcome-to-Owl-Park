import { afterEach, describe, expect, it, vi } from 'vitest';
import { BAND_COUNT, BAND_FEATHERS, runFeathers } from '@owl-park/shared';
import type { Entry, ScanReply } from '../net';
import { FULL_OFFER_EVERY_MS, SPECTATOR_WORDS, arcadeWouldEarn, badgeView, climbWouldEarn, createOfferPacer, createSpectatorBadge, endOfGameLine, turnstileWay, wouldHaveEarned } from './spectator';
import { gateRefusal } from './tickets';

/** Just enough of a page for the badge to be drawn without a browser. */
class FakeEl {
  textContent = '';
  className = '';
  type = '';
  readonly dataset: Record<string, string> = {};
  children: FakeEl[] = [];
  private readonly classes = new Set<string>();
  private readonly clicks: Array<() => void> = [];
  readonly classList = {
    add: (c: string) => void this.classes.add(c),
    remove: (c: string) => void this.classes.delete(c),
    contains: (c: string) => this.classes.has(c),
  };
  constructor(readonly tagName: string) {}
  append(...nodes: FakeEl[]): void {
    this.children.push(...nodes);
  }
  appendChild(node: FakeEl): FakeEl {
    this.children.push(node);
    return node;
  }
  setAttribute(): void {}
  addEventListener(type: string, cb: () => void): void {
    if (type === 'click') this.clicks.push(cb);
  }
  click(): void {
    for (const cb of this.clicks) cb();
  }
}

const TICKET: Entry = { gate: 'ticket', admitted: false, spectators: true };
const no = (reason: Extract<ScanReply, { ok: false }>['reason'], kind?: 'opening-night' | 'event'): ScanReply => ({ ok: false, reason, ...(kind ? { kind } : {}) });

describe('the turnstiles with spectators (OP-191)', () => {
  it('let a ticket through, and everyone while the gate is open or the pass admitted', () => {
    expect(turnstileWay({ ok: true, id: 'OWL-1', kind: 'day', started: true, validUntil: null }, TICKET)).toEqual({ go: 'in' });
    expect(turnstileWay(no('none'), { gate: 'open', admitted: true })).toEqual({ go: 'in' });
    expect(turnstileWay(no('none'), { gate: 'open', admitted: false, spectators: true })).toEqual({ go: 'in' });
    expect(turnstileWay(no('none'), { gate: 'ticket', admitted: true, spectators: true })).toEqual({ go: 'in' });
  });

  it('walk an owl without a ticket that works on in as a spectator, offering a Day Ticket in one line', () => {
    for (const reason of ['none', 'unknown', 'elsewhere', 'used', 'expired', 'revoked'] as const) {
      expect(turnstileWay(no(reason), TICKET), reason).toEqual({ go: 'spectate', line: SPECTATOR_WORDS.turnstile, sale: true });
    }
  });

  it('let an owl whose ticket waits (the store, its night) in as a spectator, saying why, with nothing to sell', () => {
    for (const [reason, kind] of [['held'], ['not-yet', 'opening-night'], ['not-yet', 'event'], ['no-length']] as const) {
      const scan = no(reason, kind);
      expect(turnstileWay(scan, TICKET), reason).toEqual({ go: 'spectate', line: gateRefusal(reason, kind).line, sale: false });
    }
  });

  it('turn the owl back when they cannot reach the park, or when the park lets no spectators in (as OP-180)', () => {
    expect(turnstileWay(no('offline'), TICKET)).toEqual({ go: 'back', line: gateRefusal('offline').line, sale: false });
    const off: Entry = { gate: 'ticket', admitted: false };
    expect(turnstileWay(no('none'), off)).toEqual({ go: 'back', line: 'You need a ticket to go in.', sale: true });
    expect(turnstileWay(no('held'), { ...off, spectators: false })).toEqual({ go: 'back', line: gateRefusal('held').line, sale: false });
  });
});

describe("a spectator's end of game (OP-191)", () => {
  it('says what the run would have earned with a Day Ticket', () => {
    expect(endOfGameLine(4)).toBe('Nice run! With a Day Ticket this would have earned 4 feathers.');
    expect(endOfGameLine(1)).toBe('Nice run! With a Day Ticket this would have earned 1 feather.');
    expect(endOfGameLine(0)).toBe(SPECTATOR_WORDS.noFeathers);
    expect(wouldHaveEarned(3)).toBe('With a Day Ticket this would have earned 3 feathers.');
    expect(wouldHaveEarned(0)).toBe('With a Day Ticket, games earn feathers.');
  });

  it("works the arcade's and the climb's feathers out on the page, as the room would pay them", () => {
    expect(arcadeWouldEarn('crossing', 40)).toBe(runFeathers('crossing', 40));
    expect(arcadeWouldEarn('flight', 0)).toBe(0);
    expect(climbWouldEarn(0, BAND_COUNT)).toBe(BAND_FEATHERS.reduce((a, b) => a + b, 0));
    expect(climbWouldEarn(2, 4)).toBe(BAND_FEATHERS[2]! + BAND_FEATHERS[3]!);
    expect(climbWouldEarn(3, 3)).toBe(0);
  });
});

describe('the full offer after games (OP-191)', () => {
  it('comes up at most once every five minutes', () => {
    let t = 1_000_000;
    const pacer = createOfferPacer(() => t);
    expect(pacer.due()).toBe(true);
    t += 1000;
    expect(pacer.due()).toBe(false);
    t += FULL_OFFER_EVERY_MS - 1001;
    expect(pacer.due()).toBe(false);
    t += 1;
    expect(pacer.due()).toBe(true);
    expect(pacer.due()).toBe(false);
    expect(FULL_OFFER_EVERY_MS).toBe(5 * 60_000);
  });
});

describe('the "Just looking" badge (OP-191)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows only for a spectator, with its words and the Get a Day Ticket button', () => {
    expect(badgeView(false).shown).toBe(false);
    expect(badgeView(true)).toEqual({ shown: true, label: 'Just looking', button: 'Get a Day Ticket' });

    vi.stubGlobal('document', { createElement: (tag: string) => new FakeEl(tag), head: new FakeEl('head') });
    const root = new FakeEl('div');
    const get = vi.fn();
    const badge = createSpectatorBadge(root as unknown as HTMLElement, get);
    const el = root.children[0]!;
    expect(el.dataset['spectator']).toBe('');
    expect(el.classList.contains('show')).toBe(false);
    expect(badge.shown()).toBe(false);
    badge.set(true);
    expect(el.classList.contains('show')).toBe(true);
    expect(el.children.map((c) => c.textContent)).toEqual(['Just looking', 'Get a Day Ticket']);
    el.children[1]!.click();
    expect(get).toHaveBeenCalledTimes(1);
    badge.set(false);
    expect(el.classList.contains('show')).toBe(false);
    expect(badge.shown()).toBe(false);
  });
});

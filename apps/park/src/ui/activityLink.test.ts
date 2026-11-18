import { describe, expect, it } from 'vitest';
import { ACTIVITY_SHARE_WORDS, shareActivity, type TravelRefusal } from '@owl-park/shared';
import { ACTIVITY_LINK_TRIES, activityLink, linkedActivity } from './activityLink';

const arcade = shareActivity('arcade')!;
const hollow = shareActivity('great-hollow')!;

function harness(answers: Array<TravelRefusal | null>, walking = 1) {
  const toasts: string[] = [];
  const asked: string[] = [];
  const queue: Array<() => void> = [];
  const link = (a = arcade) =>
    activityLink(a, {
      walking: () => walking,
      travel: (place) => {
        asked.push(place);
        return answers.length ? answers.shift()! : 'busy';
      },
      toast: (m) => toasts.push(m),
      later: (fn) => queue.push(fn),
    });
  const run = () => {
    while (queue.length) queue.shift()!();
  };
  return { link, toasts, asked, queue, run };
}

describe('activity links in the park (OP-392)', () => {
  it('reads the place only with the golink flag on', () => {
    expect(linkedActivity('?go=arcade')).toBeNull();
    expect(linkedActivity('?go=arcade&golink=1')).toBe(arcade);
    expect(linkedActivity('?go=dragon&golink=1')).toBeNull();
    expect(linkedActivity('?golink=1')).toBeNull();
  });

  it('never travels before the owl is through the turnstiles, and says to walk through them once', () => {
    const h = harness([null]);
    const l = h.link();
    l.onTravel({ places: [], gate: false });
    l.onTravel({ places: ['homes'], gate: false });
    l.onTravel({ places: ['homes', 'lobby'], gate: false });
    h.run();
    expect(h.asked).toEqual([]);
    expect(h.toasts).toEqual([ACTIVITY_SHARE_WORDS.gateFirst(arcade)]);
    expect(l.pending()).toBe(true);
  });

  it('flies the owl on once it is through, by the map’s own travel, and only once', () => {
    const h = harness([null]);
    const l = h.link();
    l.onTravel({ places: ['lobby'], gate: false });
    l.onTravel({ places: ['lobby', 'hub'], gate: true });
    l.onTravel({ places: ['lobby', 'hub'], gate: true });
    h.run();
    expect(h.asked).toEqual(['arcade']);
    expect(h.toasts.at(-1)).toBe(ACTIVITY_SHARE_WORDS.going(arcade));
    expect(l.pending()).toBe(false);
    l.onTravel({ places: ['lobby', 'hub', 'arcade'], gate: true });
    h.run();
    expect(h.asked).toEqual(['arcade']);
  });

  it('waits on a busy owl (the welcome playing), and after a while points to the map', () => {
    const h = harness(['busy', 'busy', null]);
    const l = h.link();
    l.onTravel({ places: [], gate: true });
    h.run();
    expect(h.asked).toEqual(['arcade', 'arcade', 'arcade']);
    expect(l.pending()).toBe(false);

    const g = harness([]);
    const m = g.link();
    m.onTravel({ places: [], gate: true });
    g.run();
    expect(g.asked).toHaveLength(ACTIVITY_LINK_TRIES);
    expect(g.toasts.at(-1)).toBe(ACTIVITY_SHARE_WORDS.later(arcade));
    expect(m.pending()).toBe(false);
  });

  it('takes a refusal at the gate as not through yet, and goes when the next word says it is', () => {
    const h = harness(['gate', null]);
    const l = h.link();
    l.onTravel({ places: [], gate: true });
    h.run();
    expect(l.pending()).toBe(true);
    l.onTravel({ places: ['hub'], gate: true });
    h.run();
    expect(h.asked).toEqual(['arcade', 'arcade']);
    expect(l.pending()).toBe(false);
  });

  it('goes to the place on the map the owl walks, and says so when that map has none', () => {
    const fresh = harness([null], 3);
    fresh.link(hollow).onTravel({ places: [], gate: true });
    fresh.run();
    expect(fresh.asked).toEqual(['m3-hall']);

    const old = harness([null], 1);
    const l = old.link(hollow);
    l.onTravel({ places: [], gate: true });
    old.run();
    expect(old.asked).toEqual([]);
    expect(old.toasts).toEqual([ACTIVITY_SHARE_WORDS.missing(hollow)]);
    expect(l.pending()).toBe(false);
  });

  it('is done without a word when the owl is already there', () => {
    const h = harness(['here']);
    const l = h.link();
    l.onTravel({ places: [], gate: true });
    h.run();
    expect(h.toasts).toEqual([]);
    expect(l.pending()).toBe(false);
  });
});

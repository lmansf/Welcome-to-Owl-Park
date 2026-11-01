import { describe, expect, it } from 'vitest';
import {
  ANSWER_MS,
  RETURN_CHANNEL,
  RETURN_WORDS,
  answerReturns,
  askForGamePage,
  checkoutReturnPage,
  isCheckoutReturn,
  returnPlan,
  withoutCheckoutReturn,
  type ReturnChannel,
  type ReturnDeps,
  type ReturnMessage,
} from './checkoutReturn';

/** BroadcastChannels of one browser: each hears what the others post (never itself). */
function fakeChannels() {
  const open: FakeChannel[] = [];
  const posted: ReturnMessage[] = [];
  class FakeChannel implements ReturnChannel {
    readonly name = RETURN_CHANNEL;
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    constructor() {
      open.push(this);
    }
    postMessage(message: ReturnMessage): void {
      posted.push(message);
      for (const c of [...open]) if (c !== this) c.onmessage?.({ data: structuredClone(message) });
    }
    close(): void {
      open.splice(open.indexOf(this), 1);
    }
  }
  return { make: () => new FakeChannel(), open, posted, other: () => new FakeChannel() };
}

/** A wait the test lets go of by hand, with how long it was asked for. */
function handWait() {
  const asked: number[] = [];
  let release: (() => void) | null = null;
  return {
    wait: (ms: number) => (asked.push(ms), new Promise<void>((r) => (release = r))),
    release: () => release?.(),
    asked,
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('the return address (OP-190)', () => {
  it('is the park with ?checkout=done, nothing secret in it, and the page takes it out of the address bar', () => {
    expect(isCheckoutReturn('?checkout=done')).toBe(true);
    expect(isCheckoutReturn('?transport=edge&checkout=done')).toBe(true);
    expect(isCheckoutReturn('')).toBe(false);
    expect(isCheckoutReturn('?checkout=open')).toBe(false);
    expect(withoutCheckoutReturn('https://exploreowlpark.com/?checkout=done')).toBe('https://exploreowlpark.com/');
    expect(withoutCheckoutReturn('https://exploreowlpark.com/?transport=edge&checkout=done#x')).toBe('https://exploreowlpark.com/?transport=edge#x');
  });

  it('decides by the answer: a game page answered, so this is checkout’s window and it closes; none did, so the park starts here', () => {
    expect(returnPlan(true)).toBe('close');
    expect(returnPlan(false)).toBe('boot');
  });
});

describe('asking for the game page (OP-190)', () => {
  it('a game page watching for a ticket answers this return, and no other', async () => {
    const ch = fakeChannels();
    let watching = true;
    answerReturns(ch.make, () => watching);
    const w = handWait();
    expect(await askForGamePage(ch.make, 'r1', ANSWER_MS, w.wait)).toBe(true);
    expect(w.asked).toEqual([ANSWER_MS]);
    expect(ch.posted).toEqual([
      { t: 'done', id: 'r1' },
      { t: 'here', id: 'r1' },
    ]);
    // The return page's channel is closed once it has its answer: only the game page's stays open.
    expect(ch.open).toHaveLength(1);
    // Not watching (no checkout, or it is over): no answer, and the return page gives up after its wait.
    watching = false;
    const w2 = handWait();
    const asked = askForGamePage(ch.make, 'r2', ANSWER_MS, w2.wait);
    w2.release();
    expect(await asked).toBe(false);
  });

  it('an answer to another return page, or a stray message, is not an answer', async () => {
    const ch = fakeChannels();
    const other = ch.other();
    other.onmessage = (ev) => {
      const m = ev.data as ReturnMessage;
      if (m.t === 'done') {
        other.postMessage({ t: 'here', id: 'someone-else' });
        other.postMessage({ t: 'here' } as unknown as ReturnMessage);
      }
    };
    const w = handWait();
    const asked = askForGamePage(ch.make, 'mine', ANSWER_MS, w.wait);
    await settle();
    w.release();
    expect(await asked).toBe(false);
  });

  it('a browser without BroadcastChannel has no game page to tell', async () => {
    expect(await askForGamePage(() => null, 'r', ANSWER_MS, () => Promise.resolve())).toBe(false);
    expect(answerReturns(() => null, () => true)).toBeTypeOf('function');
  });
});

describe('the return page (OP-190)', () => {
  function deps(make: ReturnDeps['make'], wait: ReturnDeps['wait']) {
    const did: string[] = [];
    let play: (() => void) | null = null;
    const d: ReturnDeps = {
      make,
      id: 'ret',
      clean: () => did.push('clean'),
      close: () => did.push('close'),
      screen: (p) => {
        did.push('screen');
        play = p;
      },
      ...(wait ? { wait } : {}),
    };
    return { d, did, play: () => play?.() };
  }

  it('with a game page answering: tries to close itself, shows the plain screen meanwhile, and Play here instead starts the park here', async () => {
    const ch = fakeChannels();
    answerReturns(ch.make, () => true);
    const t = deps(ch.make, () => new Promise(() => {}));
    let started: string | null = null;
    void checkoutReturnPage(t.d).then((s) => (started = s));
    await settle();
    expect(t.did).toEqual(['clean', 'close', 'screen']);
    expect(started).toBeNull();
    t.play();
    await settle();
    expect(started).toBe('here');
    expect(RETURN_WORDS).toEqual({ done: "You're all set. Your ticket is waiting in the park window.", playHere: 'Play here instead' });
  });

  it('with no game page answering (a phone whose game tab is asleep, or checkout in the game’s own window): the park starts here at once', async () => {
    const ch = fakeChannels();
    const w = handWait();
    const t = deps(ch.make, w.wait);
    const page = checkoutReturnPage(t.d);
    await settle();
    w.release();
    expect(await page).toBe('returned');
    expect(t.did).toEqual(['clean']);
  });

  it('a browser that will not let the page close shows the screen all the same', async () => {
    const ch = fakeChannels();
    answerReturns(ch.make, () => true);
    const t = deps(ch.make, () => new Promise(() => {}));
    t.d.close = () => {
      throw new Error('Scripts may close only the windows that were opened by them.');
    };
    void checkoutReturnPage(t.d);
    await settle();
    expect(t.did).toEqual(['clean', 'screen']);
  });
});

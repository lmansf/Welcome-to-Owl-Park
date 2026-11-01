import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Opener } from './checkout';
import { STORE_WORDS, goOn, type LinkMaker, type StoreGo } from './storeCard';

/** An opener that writes down each window asked for, and hands back a stand-in window. */
function opener() {
  const calls: string[][] = [];
  const win = { opener: {}, closed: false, location: { href: 'about:blank' }, document: { title: '', body: { textContent: '' } }, close() {}, focus() {} };
  const open: Opener = (u, t, f) => (calls.push([u, t, f]), win as unknown as Window);
  return { calls, open, win };
}

describe('the card before the store (OP-153)', () => {
  it('says its one line, with Continue and Not now, from one set of words', () => {
    expect(STORE_WORDS).toEqual({ ask: 'Ask a grown-up before buying', go: 'Continue', stay: 'Not now', label: 'Before the store' });
  });

  it('Continue opens a way’s window in its own click, before anything is awaited', () => {
    const o = opener();
    let ran = 0;
    const go: StoreGo = {
      run: (open) => {
        ran++;
        open('https://store.example/', '_blank', 'noopener');
      },
    };
    goOn(go, o.open);
    // Synchronously: no promise was waited on, so the browser still counts the tap.
    expect(ran).toBe(1);
    expect(o.calls).toEqual([['https://store.example/', '_blank', 'noopener']]);
  });

  it('a way that opens a window is handed the link maker too, for what follows the same purchase (OP-180)', () => {
    const o = opener();
    const made: string[] = [];
    const link: LinkMaker = (url) => (made.push(url), {} as HTMLAnchorElement);
    let got: LinkMaker | null = null;
    goOn({ run: (_open, l) => (got = l) }, o.open, link);
    expect(got).toBe(link);
    expect(made).toEqual([]);
  });

  it('a link opens by itself: Continue only runs what follows it, and opens no window of its own', () => {
    const o = opener();
    let followed = 0;
    goOn({ link: 'https://store.example/cart', then: () => followed++ }, o.open);
    goOn({ link: 'https://store.example/cart' }, o.open);
    expect(followed).toBe(1);
    expect(o.calls).toEqual([]);
  });
});

/** The park's own code (not its tests), file by file, from apps/park/src. */
const SRC = resolve(import.meta.dirname, '..');
function parkCode(dir = SRC, out: Array<{ file: string; code: string }> = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) parkCode(path, out);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push({ file: relative(SRC, path).split('\\').join('/'), code: readFileSync(path, 'utf8') });
  }
  return out;
}

describe('no way to the store skips the card (OP-153)', () => {
  const CODE = parkCode();
  /** The files whose code matches `re`. */
  const where = (re: RegExp) => CODE.filter(({ code }) => re.test(code)).map(({ file }) => file);

  it('reads the park’s code', () => {
    expect(CODE.length).toBeGreaterThan(20);
    expect(where(/\bcreateStoreCard\b/)).toContain('ui/hud.ts');
  });

  it('only the card opens a window', () => {
    expect(where(/\b(?:window|globalThis|self|top|parent)\s*\.\s*open\s*\(/)).toEqual(['ui/storeCard.ts']);
    // Nothing reaches for the page's opener another way (`const { open } = window`, `window['open']`).
    expect(where(/\{\s*open\s*\}\s*=\s*(?:window|globalThis)|\[\s*['"]open['"]\s*\]/)).toEqual([]);
  });

  it('only the card makes a link off the park', () => {
    expect(where(/createElement\(\s*['"`]a['"`]\s*\)/)).toEqual(['ui/storeCard.ts']);
    // An anchor written into a page's markup, or a link's address or target set anywhere else.
    expect(where(/<a[\s>]/)).toEqual([]);
    expect(where(/\.target\s*=(?!=)|setAttribute\(\s*['"](?:href|target)['"]/)).toEqual(['ui/storeCard.ts']);
    // `.href =` other than a window's own address (checkout sends the window Continue opened to its cart).
    expect(where(/(?<!location)\.href\s*=(?!=)/)).toEqual(['ui/storeCard.ts']);
  });

  it('the page itself never goes to the store: it only tidies its own address', () => {
    expect(where(/\blocation\s*\.\s*(?:assign|replace)\s*\(|(?<![\w.])location\s*\.\s*href\s*=(?!=)|\b(?:window|document|globalThis)\s*\.\s*location\s*(?:\.\s*href\s*)?=(?!=)/)).toEqual([]);
  });
});

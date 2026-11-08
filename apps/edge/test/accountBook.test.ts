import { describe, expect, it } from 'vitest';
import { LINKS_PER_EMAIL_PER_HOUR, LINKS_PER_IP_PER_HOUR, MAGIC_LINK_MS, isFriendCode, type OwlLook } from '@owl-park/shared';
import { AccountBook } from '../src/accountBook';
import { sqlStorage } from './sqlite';

const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);
const HOUR = 3600_000;

/** Deterministic randomness, so friend codes repeat run to run. */
function seq(): (n: number) => Uint8Array {
  let x = 11;
  return (n) => Uint8Array.from({ length: n }, () => (x = (x * 1103515245 + 12345) >>> 0) >>> 16);
}

/** Device ids handed out in turn. */
function devices(): () => string {
  let n = 0;
  return () => `d_device${String(++n).padStart(4, '0')}`;
}

const book = () => new AccountBook(sqlStorage(), seq());
const LOOK: OwlLook = { body: '#7A5230', belly: '#E8D5B0', accent: '#C9A227', species: 'barn' };

describe('owls’ accounts (OP-139)', () => {
  it('gives each owl a friend code of its own the first time, and the same one after', () => {
    const b = book();
    const a = b.account('c_aaaaaaaaaaaa', T0);
    expect(isFriendCode(a.friendCode)).toBe(true);
    expect(a).toEqual({ cid: 'c_aaaaaaaaaaaa', friendCode: a.friendCode, protected: false, device: null, look: null });
    expect(b.account('c_aaaaaaaaaaaa', T0 + 1000).friendCode).toBe(a.friendCode);
    const codes = new Set(Array.from({ length: 200 }, (_, i) => b.account(`c_owl${String(i).padStart(9, '0')}`, T0).friendCode));
    expect(codes.size).toBe(200);
  });

  it('passes over a friend code another owl has', () => {
    // The same bytes twice, then others: the second owl's first code is taken.
    const draws = [new Uint8Array(16).fill(0), new Uint8Array(16).fill(0), new Uint8Array(16).fill(1)];
    const b = new AccountBook(sqlStorage(), () => draws.shift() ?? new Uint8Array(16).fill(2));
    expect(b.account('c_first0000000', T0).friendCode).toBe('AAAA');
    expect(b.account('c_second000000', T0).friendCode).toBe('BBBB');
  });

  it('holds the owl on the first device to ask, and on that device only', () => {
    const b = book();
    const mint = devices();
    expect(b.stand('c_aaaaaaaaaaaa', null, mint, T0)).toEqual({ dev: 'd_device0001' });
    expect(b.account('c_aaaaaaaaaaaa', T0).device).toBe('d_device0001');
    expect(b.stand('c_aaaaaaaaaaaa', 'd_device0001', mint, T0)).toEqual({ dev: 'd_device0001' });
    // A page whose token names no device yet (another tab of the same browser) upgrades to it.
    expect(b.stand('c_aaaaaaaaaaaa', null, mint, T0)).toEqual({ dev: 'd_device0001' });
    // A token for some other device is not this owl's screen.
    expect(b.stand('c_aaaaaaaaaaaa', 'd_elsewhere00', mint, T0)).toBe('moved');
    // A page that already names its device keeps it.
    expect(b.stand('c_bbbbbbbbbbbb', 'd_mine000000', mint, T0)).toEqual({ dev: 'd_mine000000' });
  });

  it('moves the owl to the screen it is restored on: the old one finds it moved, a token from before devices too', () => {
    const b = book();
    const mint = devices();
    expect(b.stand('c_aaaaaaaaaaaa', null, mint, T0)).toEqual({ dev: 'd_device0001' });
    b.bind('c_aaaaaaaaaaaa', 'd_restored000', T0 + HOUR);
    expect(b.account('c_aaaaaaaaaaaa', T0).device).toBe('d_restored000');
    expect(b.stand('c_aaaaaaaaaaaa', 'd_device0001', mint, T0 + HOUR)).toBe('moved');
    expect(b.stand('c_aaaaaaaaaaaa', null, mint, T0 + HOUR)).toBe('moved');
    expect(b.stand('c_aaaaaaaaaaaa', 'd_restored000', mint, T0 + HOUR)).toEqual({ dev: 'd_restored000' });
    // And back again, restored on the first screen.
    b.bind('c_aaaaaaaaaaaa', 'd_device0001', T0 + 2 * HOUR);
    expect(b.stand('c_aaaaaaaaaaaa', 'd_device0001', mint, T0 + 2 * HOUR)).toEqual({ dev: 'd_device0001' });
    expect(b.stand('c_aaaaaaaaaaaa', 'd_restored000', mint, T0 + 2 * HOUR)).toBe('moved');
  });

  it('tells a room whether a page’s device still holds its owl, by the same rule, changing nothing', () => {
    const b = book();
    const mint = devices();
    // No account, or no device yet: every page holds it (accounts just turned on).
    expect(b.holds('c_aaaaaaaaaaaa', 'd_anything00')).toBe(true);
    b.account('c_aaaaaaaaaaaa', T0);
    expect(b.holds('c_aaaaaaaaaaaa', null)).toBe(true);
    expect(b.account('c_aaaaaaaaaaaa', T0).device).toBeNull();
    b.stand('c_aaaaaaaaaaaa', null, mint, T0);
    expect(b.holds('c_aaaaaaaaaaaa', 'd_device0001')).toBe(true);
    expect(b.holds('c_aaaaaaaaaaaa', 'd_elsewhere00')).toBe(false);
    expect(b.holds('c_aaaaaaaaaaaa', null)).toBe(true);
    b.bind('c_aaaaaaaaaaaa', 'd_restored000', T0 + HOUR);
    expect(b.holds('c_aaaaaaaaaaaa', 'd_device0001')).toBe(false);
    expect(b.holds('c_aaaaaaaaaaaa', null)).toBe(false);
    expect(b.holds('c_aaaaaaaaaaaa', 'd_restored000')).toBe(true);
  });

  it('keeps the owl’s look for its picture, without the day’s pledge or stray keys', () => {
    const b = book();
    b.setLook('c_aaaaaaaaaaaa', { ...LOOK, pledge: 'neon', extra: 1 } as OwlLook, T0);
    expect(b.account('c_aaaaaaaaaaaa', T0).look).toEqual(LOOK);
    b.setLook('c_aaaaaaaaaaaa', { body: '#111111', belly: '#222222', accent: '#333333' }, T0);
    expect(b.account('c_aaaaaaaaaaaa', T0).look).toEqual({ body: '#111111', belly: '#222222', accent: '#333333' });
  });

  it('sends at most three links to an email and ten from an address in an hour', () => {
    const b = book();
    for (let i = 0; i < LINKS_PER_EMAIL_PER_HOUR; i++) expect(b.maySend('e-one', 'ip-one', T0 + i)).toBe(true);
    expect(b.maySend('e-one', 'ip-two', T0 + 10)).toBe(false);
    // Another email from the same address, up to the address's ten.
    for (let i = LINKS_PER_EMAIL_PER_HOUR; i < LINKS_PER_IP_PER_HOUR; i++) expect(b.maySend(`e-${i}`, 'ip-one', T0 + 20 + i)).toBe(true);
    expect(b.maySend('e-fresh', 'ip-one', T0 + 40)).toBe(false);
    expect(b.maySend('e-fresh', 'ip-three', T0 + 40)).toBe(true);
    // An hour on, the first ones no longer count.
    expect(b.maySend('e-one', 'ip-one', T0 + HOUR + 5)).toBe(true);
  });

  it('lets a link be used once, before it runs out, for what it was sent for only', () => {
    const b = book();
    const exp = b.noteLink('n-protect', 'protect', { cid: 'c_aaaaaaaaaaaa', emailHash: 'e-one', emailSeal: 'sealed' }, T0);
    expect(exp).toBe(T0 + MAGIC_LINK_MS);
    expect(b.peekLink('n-protect', 'restore', T0)).toBeNull();
    const link = { kind: 'protect', cid: 'c_aaaaaaaaaaaa', emailHash: 'e-one', emailSeal: 'sealed' };
    expect(b.peekLink('n-protect', 'protect', T0 + 1000)).toEqual(link);
    expect(b.useLink('n-protect', 'protect', T0 + 2000)).toEqual(link);
    expect(b.useLink('n-protect', 'protect', T0 + 3000)).toBeNull();
    expect(b.peekLink('n-protect', 'protect', T0 + 3000)).toBeNull();
    // A restore link lapses after fifteen minutes.
    b.noteLink('n-restore', 'restore', { cid: null, emailHash: 'e-one', emailSeal: null }, T0);
    expect(b.peekLink('n-restore', 'restore', T0 + MAGIC_LINK_MS - 1)).toEqual({ kind: 'restore', cid: null, emailHash: 'e-one', emailSeal: null });
    expect(b.useLink('n-restore', 'restore', T0 + MAGIC_LINK_MS)).toBeNull();
    expect(b.peekLink('n-nothing', 'restore', T0)).toBeNull();
  });

  it('finds the owls an email protects, the oldest first, and only those', () => {
    const b = book();
    b.account('c_older0000000', T0);
    b.account('c_younger00000', T0 + HOUR);
    b.account('c_other0000000', T0);
    b.protect('c_younger00000', 'e-family', 'seal-1', T0 + 2 * HOUR);
    b.protect('c_older0000000', 'e-family', 'seal-1', T0 + 3 * HOUR);
    b.protect('c_other0000000', 'e-else', 'seal-2', T0 + 3 * HOUR);
    expect(b.owlsOf('e-family').map((a) => a.cid)).toEqual(['c_older0000000', 'c_younger00000']);
    expect(b.owlsOf('e-family').every((a) => a.protected)).toBe(true);
    expect(b.owlsOf('e-nobody')).toEqual([]);
    expect(b.account('c_other0000000', T0).protected).toBe(true);
    // Protected again by another email: found by that one only.
    b.protect('c_other0000000', 'e-family', 'seal-1', T0 + 4 * HOUR);
    expect(b.owlsOf('e-else')).toEqual([]);
    expect(b.owlsOf('e-family')).toHaveLength(3);
  });
});

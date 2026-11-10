import { afterEach, describe, expect, it, vi } from 'vitest';
import { goToGoogle } from './toGoogle';

afterEach(() => vi.unstubAllGlobals());

describe('the page goes to Google’s sign-in page only (OP-313)', () => {
  it('goes to Google’s own sign-in page, or its stand-in on this machine, and nowhere else', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });
    expect(goToGoogle('https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=y')).toBe(true);
    expect(goToGoogle('http://localhost:8790/o/oauth2/v2/auth?state=y')).toBe(true);
    for (const elsewhere of ['https://owl-e2e.myshopify.com/cart', 'https://accounts.google.com.evil.example/o/oauth2/v2/auth', 'http://accounts.google.com/o/oauth2/v2/auth', 'https://accounts.google.com/logout', 'javascript:alert(1)', 'not an address', null]) {
      expect(goToGoogle(elsewhere)).toBe(false);
    }
    expect(assign.mock.calls).toEqual([['https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=y'], ['http://localhost:8790/o/oauth2/v2/auth?state=y']]);
  });
});

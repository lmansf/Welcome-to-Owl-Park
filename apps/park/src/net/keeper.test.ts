import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetKeeper, keeperToken, storedKeeper } from './keeper';

// A keeper's token (OP-156): asked for with ?keeper=1, kept for the tab, never the key.

const store = new Map<string, string>();
beforeEach(() => {
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => {
  forgetKeeper();
  store.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a keeper's token", () => {
  it('is asked for once a page load with the keepers’ key, kept for the tab, and the key is not', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ token: 'tok.en', ttl: 43_200 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const prompt = vi.fn(() => 'keepers-key-0123456789');
    expect(await keeperToken('https://park.example/', true, prompt)).toBe('tok.en');
    expect(await keeperToken('https://park.example/', true, prompt)).toBe('tok.en');
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://park.example/api/admin/keeper', expect.objectContaining({ method: 'POST', headers: { 'X-Admin-Key': 'keepers-key-0123456789' } }));
    expect(storedKeeper()).toBe('tok.en');
    expect([...store.values()].join()).not.toContain('keepers-key');
  });

  it('is the kept one when the page does not ask, and none when the key is refused or not given', async () => {
    expect(await keeperToken('https://park.example', false)).toBeNull();
    store.set('owl-park-keeper', 'kept.token');
    expect(await keeperToken('https://park.example', false)).toBe('kept.token');
    store.clear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 })));
    expect(await keeperToken('https://park.example', true, () => 'wrong')).toBeNull();
    forgetKeeper();
    expect(await keeperToken('https://park.example', true, () => null)).toBeNull();
  });
});

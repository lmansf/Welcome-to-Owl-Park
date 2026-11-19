import { describe, expect, it } from 'vitest';
import { EGG_VARIANT } from '@owl-park/shared';
import { makeEggCode } from '@owl-park/shared/testing/egg-code';
import type { EdgeTransport } from '../net/edge';
import { EdgeCollections } from './edge';
import { LocalCollections, type KeyValueStorage } from './local';
import { CollectionState } from './state';

// ---- Egg codes in the page (OP-260): the offline park checks them itself; the live one asks the room server ----

class MemoryStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

const at = Date.UTC(2026, 11, 1, 17);
const page = (storage: KeyValueStorage, collector: string) =>
  new LocalCollections(storage, { collector, tz: 'America/New_York', now: () => at, random: () => 0.1 });

describe('egg codes in the offline park (OP-260)', () => {
  it('gives the egg for a code the test key signed, once on this browser, and keeps a code unspent for an owl with the egg', async () => {
    const storage = new MemoryStorage();
    const ana = new CollectionState(page(storage, 'c_eggana01'));
    const code = await makeEggCode();
    expect(await ana.redeemEgg(code)).toEqual({ ok: true, variant: EGG_VARIANT });
    await ana.refresh();
    expect(ana.owns(EGG_VARIANT)).toBe(true);
    // The same code, from another owl on the same browser: taken.
    expect(await page(storage, 'c_eggben01').redeemEgg(code)).toEqual({ ok: false, reason: 'bad' });
    // A second code on Ana: not spent, so Ben can still use it.
    const second = await makeEggCode();
    expect(await ana.redeemEgg(second)).toEqual({ ok: false, reason: 'have' });
    expect(await page(storage, 'c_eggben01').redeemEgg(second)).toEqual({ ok: true, variant: EGG_VARIANT });
  });

  it('refuses a forged code and junk', async () => {
    const forger = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign'])) as CryptoKeyPair;
    const local = page(new MemoryStorage(), 'c_eggfake1');
    expect(await local.redeemEgg(await makeEggCode((await crypto.subtle.exportKey('jwk', forger.privateKey)) as JsonWebKey))).toEqual({
      ok: false,
      reason: 'bad',
    });
    expect(await local.redeemEgg('EGG-hello')).toEqual({ ok: false, reason: 'bad' });
  });
});

describe('egg codes in the live park (OP-260)', () => {
  const edge = (answer: (path: string, init?: RequestInit) => Promise<Response>) => {
    const sent: Array<{ path: string; body: unknown }> = [];
    const transport = {
      api: (path: string, init?: RequestInit) => {
        sent.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null });
        return answer(path, init);
      },
    } as unknown as EdgeTransport;
    return { svc: new EdgeCollections(transport), sent };
  };

  it('posts the code as typed to /api/redeem and passes the answer on', async () => {
    const { svc, sent } = edge(async () => Response.json({ ok: true, variant: EGG_VARIANT }));
    expect(await svc.redeemEgg('EGG-abc')).toEqual({ ok: true, variant: EGG_VARIANT });
    expect(sent).toEqual([{ path: '/api/redeem', body: { code: 'EGG-abc' } }]);
    expect(await edge(async () => Response.json({ ok: false, reason: 'bad' })).svc.redeemEgg('x')).toEqual({ ok: false, reason: 'bad' });
  });

  it('reads too many tries, codes not taken yet and a park out of reach as their own lines', async () => {
    expect(await edge(async () => Response.json({ ok: false, reason: 'full' }, { status: 429 })).svc.redeemEgg('x')).toEqual({
      ok: false,
      reason: 'full',
    });
    expect(await edge(async () => Response.json({ ok: false, reason: 'closed' }, { status: 503 })).svc.redeemEgg('x')).toEqual({
      ok: false,
      reason: 'closed',
    });
    expect(await edge(async () => new Response('', { status: 500 })).svc.redeemEgg('x')).toEqual({ ok: false, reason: 'offline' });
    expect(await edge(async () => Promise.reject(new Error('down'))).svc.redeemEgg('x')).toEqual({ ok: false, reason: 'offline' });
    expect(await edge(async () => Response.json({ ok: false, reason: 'whatever' })).svc.redeemEgg('x')).toEqual({
      ok: false,
      reason: 'offline',
    });
  });
});

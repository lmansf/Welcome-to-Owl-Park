import { describe, expect, it } from 'vitest';
import { CollectionBook, MemoryCollectionStore } from './book';
import { EGG_VARIANT } from './easter';
import {
  EGG_CODE_LENGTH,
  EGG_CODE_WORDS,
  LOCAL_EGG_CODE_PUBLIC_KEY,
  eggRedeemLine,
  parseEggCode,
  redeemEgg,
  toBase64Url,
  verifyEggCode,
  type EggCodeLedger,
} from './eggCode';
import { LOCAL_EGG_CODE_PRIVATE_JWK, makeEggCode as signWith } from './eggCodeTestKey';

async function otherKey(): Promise<{ jwk: JsonWebKey; pub: string }> {
  const k = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  return {
    jwk: await crypto.subtle.exportKey('jwk', k.privateKey),
    pub: toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey))),
  };
}

class MemoryLedger implements EggCodeLedger {
  readonly rows = new Map<string, string>();
  taken(id: string): boolean {
    return this.rows.has(id);
  }
  take(id: string, cid: string): void {
    this.rows.set(id, cid);
  }
}

const NOW = Date.UTC(2026, 11, 1, 17);

describe('egg codes (OP-260): signed by the portfolio site, checked by the park', () => {
  it('reads a code as the site writes it: 107 characters, spaces or a lowercase prefix from a paste are fine', async () => {
    const code = await signWith(LOCAL_EGG_CODE_PRIVATE_JWK);
    expect(code).toHaveLength(EGG_CODE_LENGTH);
    expect(EGG_CODE_LENGTH).toBe(107);
    const parts = parseEggCode(code);
    expect(parts?.id).toMatch(/^[0-9a-f]{24}$/);
    expect(parseEggCode(`  egg-${code.slice(4, 40)}\n${code.slice(40)} `)?.id).toBe(parts?.id);
    expect(parseEggCode('EGG-1234')).toBeNull();
    expect(parseEggCode('hello')).toBeNull();
    expect(parseEggCode(42)).toBeNull();
  });

  it('takes a code its public key signed, and nothing else: a forged code, a changed one, another key', async () => {
    const code = await signWith(LOCAL_EGG_CODE_PRIVATE_JWK);
    expect(await verifyEggCode(code, LOCAL_EGG_CODE_PUBLIC_KEY)).toBe(parseEggCode(code)?.id);
    // Signed by someone else: the shape is right, the signature is not.
    const forger = await otherKey();
    expect(await verifyEggCode(await signWith(forger.jwk), LOCAL_EGG_CODE_PUBLIC_KEY)).toBeNull();
    // One character of the id changed after signing.
    const i = 10;
    const changed = code.slice(0, i) + (code[i] === 'A' ? 'B' : 'A') + code.slice(i + 1);
    expect(await verifyEggCode(changed, LOCAL_EGG_CODE_PUBLIC_KEY)).toBeNull();
    // The right code against the wrong key, or a key that is not a key.
    expect(await verifyEggCode(code, forger.pub)).toBeNull();
    expect(await verifyEggCode(code, 'not-a-key')).toBeNull();
  });

  it('gives the egg once per code in the whole park, keeps a code unspent for an owl that has the egg, and gives one plain refusal', async () => {
    const book = new CollectionBook(new MemoryCollectionStore());
    const ledger = new MemoryLedger();
    const id = await verifyEggCode(await signWith(LOCAL_EGG_CODE_PRIVATE_JWK), LOCAL_EGG_CODE_PUBLIC_KEY);
    // A good code: the egg goes in, and the code is taken.
    expect(redeemEgg(book, ledger, 'ana', id, NOW)).toEqual({ ok: true, variant: EGG_VARIANT });
    expect(book.owned('ana', undefined, NOW)).toContain(EGG_VARIANT);
    expect(ledger.rows.get(id!)).toBe('ana');
    // The same code on another owl: used, refused like a wrong one.
    expect(redeemEgg(book, ledger, 'ben', id, NOW)).toEqual({ ok: false, reason: 'bad' });
    expect(book.owned('ben', undefined, NOW)).not.toContain(EGG_VARIANT);
    // A second code on an owl that has the egg: not spent, so it can still go to a friend.
    const second = await verifyEggCode(await signWith(LOCAL_EGG_CODE_PRIVATE_JWK), LOCAL_EGG_CODE_PUBLIC_KEY);
    expect(redeemEgg(book, ledger, 'ana', second, NOW)).toEqual({ ok: false, reason: 'have' });
    expect(ledger.taken(second!)).toBe(false);
    expect(redeemEgg(book, ledger, 'ben', second, NOW)).toEqual({ ok: true, variant: EGG_VARIANT });
    // A code that did not check out.
    expect(redeemEgg(book, ledger, 'cat', null, NOW)).toEqual({ ok: false, reason: 'bad' });
  });

  it('says one line for each answer, the same for a wrong code and a used one', () => {
    expect(eggRedeemLine({ ok: true, variant: EGG_VARIANT })).toBe(EGG_CODE_WORDS.redeemed);
    expect(eggRedeemLine({ ok: false, reason: 'bad' })).toBe('That code doesn’t work.');
    expect(eggRedeemLine({ ok: false, reason: 'have' })).toBe('You already have the egg.');
    expect(eggRedeemLine({ ok: false, reason: 'full' })).toBe(EGG_CODE_WORDS.full);
    for (const line of Object.values(EGG_CODE_WORDS)) expect(line).not.toMatch(/grown.?up/i);
  });
});

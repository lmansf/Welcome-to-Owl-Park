import { describe, expect, it } from 'vitest';
import { FRIEND_ALPHABET, FRIEND_CODE_LENGTH, friendCodeFrom, isDeviceId, isFriendCode, normalEmail } from './accounts';

describe('accounts without passwords (OP-139)', () => {
  it('makes friend codes of four letters with no I or O, every letter as likely', () => {
    expect(FRIEND_ALPHABET).toHaveLength(24);
    expect(FRIEND_ALPHABET).not.toMatch(/[IO0-9]/);
    expect(friendCodeFrom(new Uint8Array([0, 1, 2, 3]))).toBe('ABCD');
    // A byte past the last whole run of the alphabet (240 and up) is passed over.
    expect(friendCodeFrom(new Uint8Array([255, 23, 240, 24, 47, 239]))).toBe('ZAZZ');
    expect(friendCodeFrom(new Uint8Array([250, 251, 1]))).toBeNull();
    // Each letter equally often over every byte that counts.
    const seen = new Map<string, number>();
    for (let b = 0; b < 240; b++) {
      const letter = friendCodeFrom(new Uint8Array([b, b, b, b]))![0]!;
      seen.set(letter, (seen.get(letter) ?? 0) + 1);
    }
    expect(new Set(seen.values())).toEqual(new Set([10]));
    for (let i = 0; i < 200; i++) {
      const code = friendCodeFrom(crypto.getRandomValues(new Uint8Array(16)));
      expect(code === null || (code.length === FRIEND_CODE_LENGTH && isFriendCode(code))).toBe(true);
    }
    expect(['ABCD', 'ZZZZ'].every(isFriendCode)).toBe(true);
    expect(['ABCI', 'ABC0', 'abcd', 'ABC', 'ABCDE', 7].some(isFriendCode)).toBe(false);
  });

  it('keys an email trimmed and in lower case, and refuses what is not one', () => {
    expect(normalEmail('  Grown.Up+owls@Example.COM ')).toBe('grown.up+owls@example.com');
    expect(normalEmail('a@b.co')).toBe('a@b.co');
    for (const bad of ['', 'no-at-sign', 'two@@example.com', 'a@b', 'a@-b.com', 'spa ce@example.com', `${'x'.repeat(65)}@example.com`, `a@${'b'.repeat(250)}.com`, null, 42]) {
      expect(normalEmail(bad), String(bad)).toBeNull();
    }
  });

  it('knows a device id', () => {
    expect(isDeviceId('d_abcDEF1234')).toBe(true);
    expect(['d_short', 'x_abcDEF1234', 'd_abcDEF12345', null].some(isDeviceId)).toBe(false);
  });
});

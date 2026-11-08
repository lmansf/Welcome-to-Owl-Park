import { describe, expect, it } from 'vitest';
import { readAccountLink, withoutAccountLink } from './accountLinks';

const SIG = 'A'.repeat(43);
const TOKEN = `eyJrIjoiYWNsIiwia2luZCI6InJlc3RvcmUifQ.${SIG}`;

describe('account links in the address (OP-139)', () => {
  it('reads a protect or restore token from the fragment, and nothing that is not one', () => {
    expect(readAccountLink(`#restore=${TOKEN}`)).toEqual({ kind: 'restore', token: TOKEN });
    expect(readAccountLink(`#protect=${TOKEN}`)).toEqual({ kind: 'protect', token: TOKEN });
    expect(readAccountLink('')).toBeNull();
    expect(readAccountLink('#restore=short.sig')).toBeNull();
    expect(readAccountLink(`#restore=${TOKEN}x`)).toBeNull();
    expect(readAccountLink(`#claim=${'a'.repeat(43)}`)).toBeNull();
  });

  it('takes the token out of the address and leaves the rest', () => {
    expect(withoutAccountLink(`https://park.test/?room=hub#restore=${TOKEN}`)).toBe('https://park.test/?room=hub');
    expect(withoutAccountLink(`https://park.test/#protect=${TOKEN}&other=1`)).toBe('https://park.test/#other=1');
  });
});

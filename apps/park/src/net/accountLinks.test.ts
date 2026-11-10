import { describe, expect, it } from 'vitest';
import { readAccountLink, readGoogleNote, withoutAccountLink } from './accountLinks';

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

  it('reads where a Google sign-in came back to (OP-313): an offer’s token, or how it ended and what for', () => {
    expect(readAccountLink(`#offer=${TOKEN}`)).toEqual({ kind: 'offer', token: TOKEN });
    expect(readGoogleNote('#google=stopped-protect')).toEqual({ ended: 'stopped', for: 'protect' });
    expect(readGoogleNote('#google=failed-restore')).toEqual({ ended: 'failed', for: 'restore' });
    expect(readGoogleNote('#google=failed')).toEqual({ ended: 'failed', for: null });
    expect(readGoogleNote('#google=anything')).toBeNull();
    expect(readGoogleNote('')).toBeNull();
    expect(withoutAccountLink(`https://park.test/#offer=${TOKEN}`)).toBe('https://park.test/');
    expect(withoutAccountLink('https://park.test/#google=stopped-restore&other=1')).toBe('https://park.test/#other=1');
  });
});

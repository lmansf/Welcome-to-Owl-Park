import { describe, expect, it } from 'vitest';
import { referralEmailKey } from './referrals';

describe('the email a friend’s free Day Ticket is counted by (OP-056)', () => {
  it('reads one inbox as one friend: case, +tags, and Gmail’s dots', () => {
    const one = referralEmailKey('Bea.Owl@gmail.com');
    expect(one).toBe('beaowl@gmail.com');
    for (const same of ['beaowl@gmail.com', ' BEAOWL@GMAIL.COM ', 'b.e.a.o.w.l@gmail.com', 'beaowl+park@gmail.com', 'bea.owl+2@googlemail.com']) expect(referralEmailKey(same)).toBe(one);
  });

  it('drops a +tag on any host but keeps other hosts’ dots', () => {
    expect(referralEmailKey('bea.owl+x@example.com')).toBe('bea.owl@example.com');
    expect(referralEmailKey('beaowl@example.com')).not.toBe(referralEmailKey('bea.owl@example.com'));
  });

  it('is null for anything that is not one email', () => {
    for (const bad of [null, undefined, '', 'bea', '@gmail.com', 'bea@', '+tag@gmail.com', 'a b@gmail.com']) expect(referralEmailKey(bad)).toBeNull();
  });
});

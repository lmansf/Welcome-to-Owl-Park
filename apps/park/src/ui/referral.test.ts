import { describe, expect, it } from 'vitest';
import { REFERRAL_MEMBER_FEATHERS } from '@owl-park/shared';
import { REFERRAL_WORDS, typedCode } from './referral';

describe('the Menu’s Bring a friend card (OP-056)', () => {
  it('takes a friend code typed in any case, and nothing that is not four of its letters', () => {
    expect(typedCode(' abcd ')).toBe('ABCD');
    expect(typedCode('ABCD')).toBe('ABCD');
    // No I or O in a friend code, and four letters exactly.
    expect(typedCode('ABCI')).toBeNull();
    expect(typedCode('ABO1')).toBeNull();
    expect(typedCode('ABC')).toBeNull();
    expect(typedCode('ABCDE')).toBeNull();
  });

  it('says the thank-you and its cap in the park’s own numbers', () => {
    expect(REFERRAL_WORDS.how).toContain(`${REFERRAL_MEMBER_FEATHERS} feathers`);
    expect(REFERRAL_WORDS.once).toContain('no limit');
    expect(REFERRAL_WORDS.once).toContain('email that has never had one');
    // No word for grown-ups anywhere on the card.
    expect(JSON.stringify(REFERRAL_WORDS)).not.toMatch(/grown|adult|parent/i);
  });
});

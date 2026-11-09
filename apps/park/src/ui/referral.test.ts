import { describe, expect, it } from 'vitest';
import { REFERRAL_MEMBER_FEATHERS, REFERRAL_MONTHLY_CAP } from '@owl-park/shared';
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
    expect(REFERRAL_WORDS.cap).toContain(String(REFERRAL_MONTHLY_CAP));
    expect(REFERRAL_WORDS.left(0)).toContain('still get their free ticket');
    expect(REFERRAL_WORDS.left(1)).toBe('One thank-you left this month.');
    expect(REFERRAL_WORDS.left(2)).toBe('2 thank-yous left this month.');
    // No word for grown-ups anywhere on the card.
    expect(JSON.stringify(REFERRAL_WORDS)).not.toMatch(/grown|adult|parent/i);
  });
});

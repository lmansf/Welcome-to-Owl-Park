import { describe, expect, it } from 'vitest';
import { settle, type GateChoice } from './gatePrompt';

describe('the turnstiles’ question (OP-198)', () => {
  it('a close goes the chosen way, and neither choice steps the owl back out', () => {
    const run = (choice: GateChoice) => {
      const got: string[] = [];
      settle({ buy: () => got.push('buy'), guest: () => got.push('guest'), stay: () => got.push('stay') }, choice);
      return got;
    };
    expect(run('buy')).toEqual(['buy']);
    expect(run('guest')).toEqual(['guest']);
    // Escape, a tap beside the card, another screen opening: the owl stays out, nothing is bought.
    expect(run(null)).toEqual(['stay']);
  });
});

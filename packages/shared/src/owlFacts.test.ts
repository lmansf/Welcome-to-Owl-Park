import { describe, expect, it } from 'vitest';
import { OWL_FACTS, owlFact } from './owlFacts';

describe('the load screen’s owl facts (OP-129)', () => {
  it('are twenty short lines, each its own, each a sentence', () => {
    expect(OWL_FACTS).toHaveLength(20);
    expect(new Set(OWL_FACTS).size).toBe(OWL_FACTS.length);
    for (const f of OWL_FACTS) {
      // One line on a phone: a glance, not a read.
      expect(f.length, f).toBeLessThanOrEqual(80);
      expect(f, f).toMatch(/^[A-Z].*\.$/);
    }
  });

  it('come round in order from any start, the list over and over', () => {
    expect(owlFact(0, 0)).toBe(OWL_FACTS[0]);
    expect(owlFact(3, 1)).toBe(OWL_FACTS[4]);
    expect(owlFact(19, 1)).toBe(OWL_FACTS[0]);
    expect(owlFact(5, 40)).toBe(OWL_FACTS[5]);
    expect(owlFact(-1, 0)).toBe(OWL_FACTS[19]);
    expect(owlFact(7.9, 0)).toBe(OWL_FACTS[7]);
  });
});

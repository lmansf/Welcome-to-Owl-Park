import { describe, expect, it } from 'vitest';
import { FLAGS, flagOn, type FlagName } from './flags';

const names = Object.keys(FLAGS) as FlagName[];
const specs = Object.values(FLAGS as Record<string, { param: string; note: string }>);

describe('flag-hidden features (merge gate class 3)', () => {
  it('every flag is off on a plain address, on =0 and on any other value', () => {
    for (const name of names) {
      const { param } = (FLAGS as Record<string, { param: string }>)[name]!;
      expect(flagOn(name, '')).toBe(false);
      expect(flagOn(name, '?room=hub')).toBe(false);
      expect(flagOn(name, `?${param}=0`)).toBe(false);
      expect(flagOn(name, `?${param}=true`)).toBe(false);
    }
  });

  it('a flag is on only with =1', () => {
    for (const name of names) {
      const { param } = (FLAGS as Record<string, { param: string }>)[name]!;
      expect(flagOn(name, `?${param}=1`)).toBe(true);
    }
  });

  it('every param is lower case letters, digits and dashes, and no two flags share one', () => {
    const params = specs.map((s) => s.param);
    for (const p of params) expect(p).toMatch(/^[a-z0-9-]{2,32}$/);
    expect(new Set(params).size).toBe(params.length);
  });

  it('a name that is not a flag is never on', () => {
    expect(flagOn('nope' as FlagName, '?nope=1')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { PRESENTS } from '@owl-park/shared';
import { announcePresents } from './presents';

class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

describe("the park's presents", () => {
  const owned = ['hoot', ...PRESENTS.map((p) => p.variant)];

  it('are announced once on a device', () => {
    const storage = new MemoryStorage();
    const said: string[] = [];
    const toast = (m: string) => void said.push(m);
    expect(announcePresents(owned, toast, storage)).toHaveLength(PRESENTS.length);
    expect(said).toEqual(PRESENTS.map((p) => p.note));
    expect(announcePresents(owned, toast, storage)).toEqual([]);
    expect(said).toHaveLength(PRESENTS.length);
  });

  it('wait until the collection holds them, and survive storage that throws or holds garbage', () => {
    const said: string[] = [];
    const toast = (m: string) => void said.push(m);
    expect(announcePresents(['hoot'], toast, new MemoryStorage())).toEqual([]);
    const garbage = new MemoryStorage();
    garbage.setItem('owl-park:presents-seen', '{"not":"a list"}');
    expect(announcePresents(owned, toast, garbage)).toHaveLength(PRESENTS.length);
    const broken = {
      getItem(): string | null {
        throw new Error('denied');
      },
      setItem(): void {
        throw new Error('denied');
      },
    };
    expect(announcePresents(owned, toast, broken)).toHaveLength(PRESENTS.length);
    expect(announcePresents(owned, toast, null)).toHaveLength(PRESENTS.length);
  });
});

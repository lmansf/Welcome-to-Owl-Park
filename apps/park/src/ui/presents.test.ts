import { describe, expect, it } from 'vitest';
import { PRESENTS, type Present } from '@owl-park/shared';
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
  // The presents as said in their seasons: every note in season, so each test below hears them all.
  const SEASON = Date.UTC(2026, 9, 25);
  const owned = ['hoot', ...PRESENTS.map((p) => p.variant)];
  const announce = (o: readonly string[], toast: (m: string) => void, storage: Parameters<typeof announcePresents>[2]) => announcePresents(o, toast, storage, SEASON);

  it('are announced once on a device', () => {
    const storage = new MemoryStorage();
    const said: string[] = [];
    const toast = (m: string) => void said.push(m);
    expect(announce(owned, toast, storage)).toHaveLength(PRESENTS.length);
    expect(said).toEqual(PRESENTS.map((p) => p.note));
    expect(announce(owned, toast, storage)).toEqual([]);
    expect(said).toHaveLength(PRESENTS.length);
  });

  it('wait until the collection holds them, and survive storage that throws or holds garbage', () => {
    const said: string[] = [];
    const toast = (m: string) => void said.push(m);
    expect(announce(['hoot'], toast, new MemoryStorage())).toEqual([]);
    const garbage = new MemoryStorage();
    garbage.setItem('owl-park:presents-seen', '{"not":"a list"}');
    expect(announce(owned, toast, garbage)).toHaveLength(PRESENTS.length);
    const broken = {
      getItem(): string | null {
        throw new Error('denied');
      },
      setItem(): void {
        throw new Error('denied');
      },
    };
    expect(announce(owned, toast, broken)).toHaveLength(PRESENTS.length);
    expect(announce(owned, toast, null)).toHaveLength(PRESENTS.length);
  });

  it("stop saying a season's note once its season ends, and the present stays (OP-297)", () => {
    const bat = PRESENTS.find((p) => p.variant === 'bat~0')!;
    expect(bat.noteUntil).toBe(Date.UTC(2026, 10, 1, 12));
    const said: string[] = [];
    const toast = (m: string) => void said.push(m);
    // A week after Halloween a new owl still holds the Bat pet, and hears no greeting for it.
    expect(announcePresents(owned, toast, new MemoryStorage(), Date.UTC(2026, 10, 7, 20))).toEqual([]);
    expect(announcePresents(owned, toast, new MemoryStorage(), bat.noteUntil!)).toEqual([]);
    expect(said).toEqual([]);
    // On Halloween night anywhere it is still said.
    expect(announcePresents(owned, toast, new MemoryStorage(), bat.noteUntil! - 1)).toContain(bat);
    // A present with no season is said whenever the collection first holds it.
    const always: Present = { variant: 'hoot', note: 'A present.' };
    expect(announcePresents(['hoot'], toast, new MemoryStorage(), Date.UTC(2030, 0, 1), [always])).toEqual([always]);
  });
});

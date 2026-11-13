import { afterEach, describe, expect, it, vi } from 'vitest';
import { HIDDEN_KEY, deviceStore, readHidden, saveHidden } from './ribbon';

function memory(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('the busy ribbon, hidden (OP-309)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the words an owl hid on this device, not just in this tab, so the note stays closed on a phone', () => {
    const local = memory();
    const session = memory();
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', session);
    expect(deviceStore()).toBe(local);
    saveHidden(deviceStore(), 'Map is Under Construction!');
    expect(local.data.get(HIDDEN_KEY)).toBe('Map is Under Construction!');
    expect(session.data.size).toBe(0);
    // A later visit reads them back.
    expect(readHidden(deviceStore())).toBe('Map is Under Construction!');
  });

  it('works where the browser keeps nothing', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(deviceStore()).toBeNull();
    expect(readHidden(null)).toBeNull();
    expect(() => saveHidden(null, 'words')).not.toThrow();
  });
});

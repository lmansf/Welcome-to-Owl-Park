import { describe, expect, it } from 'vitest';
import { SETTINGS_KEY, SettingsStore, defaultSettings, parseSettings } from './settings';

function memory(initial?: string) {
  const data = new Map<string, string>(initial === undefined ? [] : [[SETTINGS_KEY, initial]]);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

describe('settings', () => {
  it('start with the quest cards and the thumbstick shown, and calm motion when the device asks for less motion', () => {
    expect(defaultSettings(false)).toEqual({ questCards: true, thumbstick: true, calm: false });
    expect(defaultSettings(true)).toEqual({ questCards: true, thumbstick: true, calm: true });
  });

  it('keep each saved setting that is a boolean and drop the rest', () => {
    expect(parseSettings('{"questCards":false,"calm":true}', false)).toEqual({ questCards: false, thumbstick: true, calm: true });
    expect(parseSettings('{"questCards":"no","thumbstick":0,"calm":null,"extra":true}', true)).toEqual(defaultSettings(true));
    for (const bad of [null, '', 'nope', '[]', '42', 'null', '"x"']) expect(parseSettings(bad, false), String(bad)).toEqual(defaultSettings(false));
  });

  it('save a change on the device, tell the listeners, and stay quiet when nothing changes', () => {
    const storage = memory();
    const store = new SettingsStore(storage, false);
    const seen: boolean[] = [];
    const stop = store.onChange((s) => seen.push(s.questCards));
    store.set({ questCards: false });
    store.set({ questCards: false });
    expect(seen).toEqual([false]);
    expect(JSON.parse(storage.data.get(SETTINGS_KEY)!)).toEqual({ questCards: false, thumbstick: true, calm: false });
    expect(new SettingsStore(storage, false).get().questCards).toBe(false);
    stop();
    store.set({ questCards: true });
    expect(seen).toEqual([false]);
  });

  it('ignore what is not a setting, and keep working when the device will not store anything', () => {
    const store = new SettingsStore(
      {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
      false,
    );
    store.set({ calm: true, ...({ admin: true } as object) });
    expect(store.get()).toEqual({ questCards: true, thumbstick: true, calm: true });
  });
});

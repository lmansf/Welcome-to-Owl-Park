import { describe, expect, it } from 'vitest';
import { attachKeyboard, heldDirection } from './keyboard';

describe('heldDirection', () => {
  it('maps WASD and the arrow keys to the four ways', () => {
    expect(heldDirection(['KeyD'])).toEqual({ x: 1, y: 0 });
    expect(heldDirection(['ArrowLeft'])).toEqual({ x: -1, y: 0 });
    expect(heldDirection(['KeyW'])).toEqual({ x: 0, y: -1 });
    expect(heldDirection(['ArrowDown'])).toEqual({ x: 0, y: 1 });
  });

  it('normalises diagonals', () => {
    const d = heldDirection(['KeyW', 'ArrowRight'])!;
    expect(d.x).toBeCloseTo(Math.SQRT1_2);
    expect(d.y).toBeCloseTo(-Math.SQRT1_2);
  });

  it('is null when nothing walks or opposite keys cancel out', () => {
    expect(heldDirection([])).toBeNull();
    expect(heldDirection(['KeyE', 'KeyQ'])).toBeNull();
    expect(heldDirection(['KeyA', 'KeyD'])).toBeNull();
  });

  it('counts a way once when both of its keys are held', () => {
    expect(heldDirection(['KeyD', 'ArrowRight'])).toEqual({ x: 1, y: 0 });
  });
});

/** Just enough of a window for the listener: events are plain objects handed to the handlers. */
function fakeWindow() {
  const handlers = new Map<string, (e: unknown) => void>();
  const doc = { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} };
  const win = {
    document: doc,
    addEventListener: (type: string, fn: (e: unknown) => void) => handlers.set(type, fn),
    removeEventListener: (type: string) => handlers.delete(type),
  };
  const key = (type: 'keydown' | 'keyup', code: string, extra: Record<string, unknown> = {}) => {
    let prevented = false;
    handlers.get(type)?.({ code, key: '', repeat: false, target: null, preventDefault: () => (prevented = true), ...extra });
    return prevented;
  };
  return { win: win as unknown as Window, key, fire: (type: string) => handlers.get(type)?.({}) };
}

describe('attachKeyboard', () => {
  const setup = () => {
    const calls: string[] = [];
    const fake = fakeWindow();
    const keys = attachKeyboard(fake.win, { interact: () => calls.push('interact'), collection: () => calls.push('collection'), close: () => calls.push('close') });
    return { ...fake, keys, calls };
  };

  it('walks while a key is held and stops when it is let go', () => {
    const { key, keys } = setup();
    expect(key('keydown', 'KeyD')).toBe(true);
    expect(keys.direction()).toEqual({ x: 1, y: 0 });
    key('keyup', 'KeyD');
    expect(keys.direction()).toBeNull();
  });

  it('runs E, Q and Escape once per press', () => {
    const { key, calls } = setup();
    key('keydown', 'KeyE');
    key('keydown', 'KeyE', { repeat: true });
    key('keydown', 'KeyQ');
    key('keydown', 'Escape');
    expect(calls).toEqual(['interact', 'collection', 'close']);
  });

  it('leaves typing and browser shortcuts alone', () => {
    const { key, keys, calls } = setup();
    expect(key('keydown', 'KeyW', { target: { tagName: 'INPUT', isContentEditable: false } })).toBe(false);
    key('keydown', 'KeyW', { ctrlKey: true });
    key('keydown', 'KeyE', { metaKey: true });
    expect(keys.direction()).toBeNull();
    expect(calls).toEqual([]);
  });

  it('lets go of every key when the window loses focus', () => {
    const { key, keys, fire } = setup();
    key('keydown', 'ArrowUp');
    fire('blur');
    expect(keys.direction()).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { PARK_KEYS_ATTR, SIDEWAYS_MIN, alongTheFloor, attachKeyboard, heldDirection, holdsUp } from './keyboard';

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

describe('alongTheFloor (OP-212)', () => {
  it('walks a side view left or right only, at full pace', () => {
    expect(alongTheFloor({ x: 1, y: 0 })).toEqual({ x: 1, y: 0 });
    expect(alongTheFloor(heldDirection(['KeyW', 'ArrowLeft']))).toEqual({ x: -1, y: 0 });
    expect(alongTheFloor({ x: SIDEWAYS_MIN, y: -0.9 })).toEqual({ x: 1, y: 0 });
  });

  it('walks nowhere on up or down alone, a push mostly up, or nothing held', () => {
    expect(alongTheFloor(heldDirection(['ArrowUp']))).toBeNull();
    expect(alongTheFloor(heldDirection(['KeyS']))).toBeNull();
    expect(alongTheFloor({ x: 0.2, y: -0.98 })).toBeNull();
    expect(alongTheFloor(null)).toBeNull();
  });
});

describe('holdsUp (OP-212)', () => {
  it('is up held, alone or with a side key, or a thumbstick pushed up as steep as a diagonal', () => {
    expect(holdsUp(heldDirection(['ArrowUp']))).toBe(true);
    expect(holdsUp(heldDirection(['KeyW', 'KeyD']))).toBe(true);
    expect(holdsUp({ x: 0.3, y: -0.95 })).toBe(true);
  });

  it('is not a push mostly sideways, down, or nothing held', () => {
    expect(holdsUp({ x: 0.9, y: -0.44 })).toBe(false);
    expect(holdsUp(heldDirection(['ArrowDown']))).toBe(false);
    expect(holdsUp(heldDirection(['ArrowRight']))).toBe(false);
    expect(holdsUp(null)).toBe(false);
  });
});

/** Just enough of a window for the listener: events are plain objects handed to the handlers. */
function fakeWindow() {
  const handlers = new Map<string, (e: unknown) => void>();
  const docHandlers = new Map<string, (e: unknown) => void>();
  const doc = {
    visibilityState: 'visible',
    addEventListener: (type: string, fn: (e: unknown) => void) => docHandlers.set(type, fn),
    removeEventListener: (type: string) => docHandlers.delete(type),
  };
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
  return {
    win: win as unknown as Window,
    key,
    fire: (type: string) => handlers.get(type)?.({}),
    focus: (target: unknown) => docHandlers.get('focusin')?.({ target }),
  };
}

describe('attachKeyboard', () => {
  const setup = () => {
    const calls: string[] = [];
    const fake = fakeWindow();
    const keys = attachKeyboard(fake.win, {
      up: () => calls.push('up'),
      interact: () => calls.push('interact'),
      jump: () => calls.push('jump'),
      jumpEnd: () => calls.push('jump end'),
      menu: () => calls.push('menu'),
      say: () => calls.push('say'),
      emoteKey: (n) => calls.push(`emote ${n}`),
      owl: () => calls.push('owl'),
      journal: () => calls.push('journal'),
      close: () => calls.push('close'),
    });
    return { ...fake, keys, calls };
  };

  it('walks while a key is held and stops when it is let go', () => {
    const { key, keys } = setup();
    expect(key('keydown', 'KeyD')).toBe(true);
    expect(keys.direction()).toEqual({ x: 1, y: 0 });
    key('keyup', 'KeyD');
    expect(keys.direction()).toBeNull();
  });

  it('runs E, M, T, Q, J and Escape once per press', () => {
    const { key, calls } = setup();
    key('keydown', 'KeyE');
    key('keydown', 'KeyE', { repeat: true });
    key('keydown', 'KeyM');
    key('keydown', 'KeyT');
    key('keydown', 'KeyT', { repeat: true });
    key('keydown', 'KeyQ');
    key('keydown', 'KeyJ');
    key('keydown', 'Escape');
    expect(calls).toEqual(['interact', 'menu', 'say', 'owl', 'journal', 'close']);
  });

  it('plays emotes 1 to 8 from the number row and the keypad, once per press', () => {
    const { key, calls } = setup();
    key('keydown', 'Digit1');
    key('keydown', 'Digit1', { repeat: true });
    key('keydown', 'Numpad8');
    key('keydown', 'Digit9');
    key('keydown', 'Digit0');
    key('keydown', 'Digit3', { target: { tagName: 'TEXTAREA', isContentEditable: false } });
    expect(calls).toEqual(['emote 1', 'emote 8']);
  });

  it('jumps on the space bar once per press and lets go as it comes up (OP-084), and keeps the page from scrolling', () => {
    const { key, calls } = setup();
    expect(key('keydown', 'Space')).toBe(true);
    expect(key('keydown', 'Space', { repeat: true })).toBe(true);
    expect(calls).toEqual(['jump']);
    key('keyup', 'Space');
    expect(calls).toEqual(['jump', 'jump end']);
  });

  it('leaves the space bar to a focused button, which it presses', () => {
    const { key, calls } = setup();
    expect(key('keydown', 'Space', { target: { tagName: 'BUTTON', isContentEditable: false, getAttribute: () => null } })).toBe(false);
    expect(key('keydown', 'Space', { target: { tagName: 'DIV', isContentEditable: false, getAttribute: () => 'button' } })).toBe(false);
    expect(key('keydown', 'Space', { target: { tagName: 'TEXTAREA', isContentEditable: false } })).toBe(false);
    expect(calls).toEqual([]);
  });

  it("jumps on the space bar from the play bar's buttons, which keep the focus after a click (OP-293)", () => {
    const { key, calls } = setup();
    // The Menu button, focused by a click or given the focus back as the menu closes: Space is still the jump, never the menu.
    const menuBtn = { tagName: 'BUTTON', isContentEditable: false, getAttribute: () => null, closest: (sel: string) => (sel === `[${PARK_KEYS_ATTR}]` ? {} : null) };
    expect(key('keydown', 'Space', { target: menuBtn })).toBe(true);
    expect(key('keyup', 'Space', { target: menuBtn })).toBe(true);
    expect(calls).toEqual(['jump', 'jump end']);
    // A button anywhere else (a dialog's) still takes its own Space press.
    const elsewhere = { tagName: 'BUTTON', isContentEditable: false, getAttribute: () => null, closest: () => null };
    expect(key('keydown', 'Space', { target: elsewhere })).toBe(false);
    expect(key('keyup', 'Space', { target: elsewhere })).toBe(false);
    expect(calls).toEqual(['jump', 'jump end', 'jump end']);
  });

  it('leaves typing and browser shortcuts alone', () => {
    const { key, keys, calls } = setup();
    expect(key('keydown', 'KeyW', { target: { tagName: 'INPUT', isContentEditable: false } })).toBe(false);
    key('keydown', 'KeyW', { ctrlKey: true });
    key('keydown', 'KeyE', { metaKey: true });
    expect(keys.direction()).toBeNull();
    expect(calls).toEqual([]);
  });

  it('lets go of every key when the window loses focus, the space bar too', () => {
    const { key, keys, fire, calls } = setup();
    key('keydown', 'ArrowUp');
    key('keydown', 'Space');
    fire('blur');
    expect(keys.direction()).toBeNull();
    expect(calls).toEqual(['up', 'jump', 'jump end']);
  });

  it('presses up once a press on W or the up arrow, which walk up as well while held (OP-212)', () => {
    const { key, keys, calls } = setup();
    expect(key('keydown', 'KeyW')).toBe(true);
    key('keydown', 'KeyW', { repeat: true });
    expect(keys.direction()).toEqual({ x: 0, y: -1 });
    key('keyup', 'KeyW');
    key('keydown', 'ArrowUp');
    key('keydown', 'ArrowDown');
    key('keydown', 'KeyD');
    expect(calls).toEqual(['up', 'up']);
  });
  it('types every park key into a text field: no walk, no jump, no action, nothing prevented', () => {
    const { key, keys, calls } = setup();
    const field = { tagName: 'TEXTAREA', isContentEditable: false };
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'Space', 'ShiftLeft', 'KeyE', 'KeyM', 'KeyT', 'KeyQ', 'KeyJ', 'Digit2']) {
      expect(key('keydown', code, { target: field }), code).toBe(false);
    }
    expect(key('keydown', 'KeyD', { target: { tagName: 'DIV', isContentEditable: true } })).toBe(false);
    expect(keys.direction()).toBeNull();
    expect(calls).toEqual([]);
  });

  it("leaves a phone keyboard's composing keys alone, wherever they land", () => {
    const { key, keys, calls } = setup();
    expect(key('keydown', 'KeyD', { isComposing: true })).toBe(false);
    expect(key('keydown', '', { keyCode: 229 })).toBe(false);
    expect(keys.direction()).toBeNull();
    expect(calls).toEqual([]);
  });

  it('lets go of held keys when a text field takes the focus, and not for a button', () => {
    const { key, keys, focus, calls } = setup();
    key('keydown', 'KeyD');
    key('keydown', 'Space');
    focus({ tagName: 'BUTTON', isContentEditable: false });
    expect(keys.direction()).toEqual({ x: 1, y: 0 });
    focus({ tagName: 'TEXTAREA', isContentEditable: false });
    expect(keys.direction()).toBeNull();
    expect(calls).toEqual(['jump', 'jump end']);
  });
});

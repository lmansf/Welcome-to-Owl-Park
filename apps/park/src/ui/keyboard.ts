import type { Vec2 } from '@owl-park/shared';

/**
 * Keyboard controls: WASD and the arrow keys walk the owl while held, E interacts with what the
 * owl stands at, M opens and closes the Menu, T the emote wheel, 1 to 8 play an emote, Q the owl
 * builder, J the quests, and Escape closes whatever is open. Keys are matched
 * by place (`KeyboardEvent.code`), so ZQSD walks on an AZERTY keyboard. Typing in a text field,
 * and shortcuts with Ctrl, Alt or Cmd, are left alone.
 */

type Way = 'up' | 'down' | 'left' | 'right';

const WALK_KEYS: Record<string, Way> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

/** The unit vector the held keys ask for (diagonals normalised); null when none are held or they cancel out. */
export function heldDirection(codes: Iterable<string>): Vec2 | null {
  const ways = new Set<Way>();
  for (const c of codes) {
    const w = WALK_KEYS[c];
    if (w) ways.add(w);
  }
  const x = (ways.has('right') ? 1 : 0) - (ways.has('left') ? 1 : 0);
  const y = (ways.has('down') ? 1 : 0) - (ways.has('up') ? 1 : 0);
  if (!x && !y) return null;
  const len = Math.hypot(x, y);
  return { x: x / len, y: y / len };
}

export interface KeyActions {
  /** E: use whatever the owl is standing at. */
  interact(): void;
  /** M: open or close the Menu. */
  menu(): void;
  /** T: open or close the emote wheel. */
  emotes(): void;
  /** 1 to 8 (the number row or the keypad): play an emote, as numbered on the wheel. */
  emoteKey(n: number): void;
  /** Q: open or close the owl builder. */
  owl(): void;
  /** J: open or close the quests. */
  journal(): void;
  /** Escape: close open panels. */
  close(): void;
}

export interface Keys {
  /** Where the held walking keys point right now. */
  direction(): Vec2 | null;
  detach(): void;
}

/** A key press that belongs to a text field or a browser shortcut, not to the park. */
function ignored(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
}

export function attachKeyboard(win: Window, actions: KeyActions): Keys {
  const held = new Set<string>();
  const onDown = (e: KeyboardEvent) => {
    if (ignored(e)) return;
    if (e.code in WALK_KEYS) {
      held.add(e.code);
      e.preventDefault(); // arrow keys would otherwise scroll whatever has focus
      return;
    }
    if (e.repeat) return;
    if (e.code === 'KeyE') actions.interact();
    else if (e.code === 'KeyM') actions.menu();
    else if (e.code === 'KeyT') actions.emotes();
    else if (e.code === 'KeyQ') actions.owl();
    else if (e.code === 'KeyJ') actions.journal();
    else if (e.code === 'Escape') actions.close();
    else {
      const n = /^(?:Digit|Numpad)([1-8])$/.exec(e.code)?.[1];
      if (n) actions.emoteKey(Number(n));
    }
  };
  const onUp = (e: KeyboardEvent) => {
    held.delete(e.code);
    // While Cmd is down, macOS sends no key-ups for the other keys: start afresh when it lifts.
    if (e.key === 'Meta') held.clear();
  };
  const release = () => held.clear();
  const onVisibility = () => {
    if (win.document.visibilityState !== 'visible') release();
  };
  win.addEventListener('keydown', onDown);
  win.addEventListener('keyup', onUp);
  win.addEventListener('blur', release);
  win.document.addEventListener('visibilitychange', onVisibility);
  return {
    direction: () => heldDirection(held),
    detach() {
      win.removeEventListener('keydown', onDown);
      win.removeEventListener('keyup', onUp);
      win.removeEventListener('blur', release);
      win.document.removeEventListener('visibilitychange', onVisibility);
      held.clear();
    },
  };
}

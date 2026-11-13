import type { Vec2 } from '@owl-park/shared';
import { releaseOnTyping, typingInField } from './typing';

/**
 * Keyboard controls: WASD and the arrow keys walk the owl while held (in a room seen from the side,
 * the tree, only left and right walk, and a press of W or the up arrow goes through the doorway or up
 * the stair the owl stands in, OP-212), E interacts with what the
 * owl stands at, the space bar jumps (OP-084: again in the air to flap, held to glide), Shift dashes
 * in a parkour course (OP-224: once a jump, in the air), M opens the Menu on its map (OP-130) and closes it, T the Say wheel, 1 to 8 play an
 * emote, Q goes to the mirror in the owl's nest where Your owl is (OP-077), J the quests, and
 * Escape closes whatever is open. Keys are matched by place (`KeyboardEvent.code`), so ZQSD walks
 * on an AZERTY keyboard. Typing in a text field, and shortcuts with Ctrl, Alt or Cmd, are left alone.
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

/** How far sideways (of 1) a held direction must point to walk a side view: a diagonal does, a near-vertical push does not. */
export const SIDEWAYS_MIN = 0.35;

/**
 * The held direction as a room seen from the side walks it (the tree, OP-212): along the floor only,
 * left or right, since up goes through doorways there and the floor is a line. A thumbstick pushed
 * mostly up or down walks nowhere; one pushed sideways enough walks that way at full pace.
 */
export function alongTheFloor(dir: Vec2 | null): Vec2 | null {
  if (!dir || Math.abs(dir.x) < SIDEWAYS_MIN) return null;
  return { x: Math.sign(dir.x), y: 0 };
}

/** How far up (of 1) a held direction must point to hold up in a side view (OP-212): the up key, alone or with a side key, or the thumbstick pushed up at least as steep as a diagonal. */
export const UP_HELD = 0.7;

/** Whether the held direction holds up (OP-212): in a side view, an owl walking or standing in a doorway with up held goes through it. */
export function holdsUp(dir: Vec2 | null): boolean {
  return !!dir && dir.y <= -UP_HELD;
}

/** The keys that press up (OP-212): W and the up arrow. */
const UP_KEYS = new Set(['KeyW', 'ArrowUp']);

export interface KeyActions {
  /** W or the up arrow goes down (once a press, OP-212): in a side view, through the doorway the owl stands in. They walk as well, held. `at`: when (ms since 1970). */
  up(at?: number): void;
  /** E: use whatever the owl is standing at. */
  interact(): void;
  /** The space bar goes down (the Jump button on a phone, OP-084): a jump, or a flap in the air. `at`: when (ms since 1970). */
  jump(at?: number): void;
  /** The space bar comes up, or the page loses the keyboard: let go on the way up and the rise is cut; the glide ends. */
  jumpEnd(at?: number): void;
  /** Shift (either one): a dash, in a parkour course (OP-224). `at`: when (ms since 1970). */
  dash?(at?: number): void;
  /** M: open the Menu on its map (OP-130), or close it. */
  menu(): void;
  /** T: open or close the Say wheel. */
  say(): void;
  /** 1 to 8 (the number row or the keypad): play an emote, as numbered on the wheel. */
  emoteKey(n: number): void;
  /** Q: to the mirror in the owl's nest, where Your owl is (OP-077), or close Your owl. */
  owl(): void;
  /** J: open or close the quests. */
  journal(): void;
  /** Escape: close open panels. */
  close(): void;
}

export interface Keys {
  /** Where the held walking keys point right now. */
  direction(): Vec2 | null;
  /**
   * How many times the walking keys have all been let go (the thumbstick come to rest, where the HUD's
   * is counted in): it moves even when a key is let go and pressed again between two looks at
   * `direction`, which a doorway back waits on (game/doors.ts, backWaits).
   */
  rests(): number;
  detach(): void;
}

/** A key press that belongs to a text field or a browser shortcut, not to the park. */
function ignored(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey || e.altKey || typingInField(e);
}

/**
 * When an input happened (ms since 1970), from the event's own time: a press and its letting go keep
 * the time between them even when the page is slow to hear them (a busy frame). Now, without one.
 */
export function eventTime(e: { timeStamp?: number }): number {
  const now = Date.now();
  const t = typeof e.timeStamp === 'number' && e.timeStamp > 0 ? performance.timeOrigin + e.timeStamp : now;
  return Math.min(now, Math.max(now - 1000, t));
}

/**
 * Where the space bar is always the jump, even on a focused button (OP-293): the play bar's buttons
 * (Menu, Emotes, Say, the actions, the pad) keep the focus after a click, and the menu gives it back to
 * the Menu button as it closes, so the next Space would open the menu on its map. Each has its own key.
 */
export const PARK_KEYS_ATTR = 'data-park-keys';

/** Whether a key press comes from inside the play bar (PARK_KEYS_ATTR). */
function inPlayBar(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return typeof t?.closest === 'function' && t.closest(`[${PARK_KEYS_ATTR}]`) !== null;
}

/** The space bar on a focused button or link presses it: that press is the button's, not a jump (but not in the play bar). */
function pressesControl(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && !inPlayBar(e) && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'SUMMARY' || t.getAttribute?.('role') === 'button');
}

export function attachKeyboard(win: Window, actions: KeyActions): Keys {
  const held = new Set<string>();
  let rests = 0;
  /** Change which keys are held, and count it when that leaves the owl no way to walk where it had one. */
  const hold = (change: () => void) => {
    const walked = heldDirection(held) !== null;
    change();
    if (walked && heldDirection(held) === null) rests += 1;
  };
  const onDown = (e: KeyboardEvent) => {
    if (ignored(e)) return;
    if (e.code in WALK_KEYS) {
      hold(() => held.add(e.code));
      e.preventDefault(); // arrow keys would otherwise scroll whatever has focus
      if (UP_KEYS.has(e.code) && !e.repeat) actions.up(eventTime(e));
      return;
    }
    if (e.code === 'Space') {
      if (pressesControl(e)) return;
      e.preventDefault(); // the space bar would otherwise scroll the page
      if (!e.repeat) actions.jump(eventTime(e));
      return;
    }
    if (e.repeat) return;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') actions.dash?.(eventTime(e));
    else if (e.code === 'KeyE') actions.interact();
    else if (e.code === 'KeyM') actions.menu();
    else if (e.code === 'KeyT') actions.say();
    else if (e.code === 'KeyQ') actions.owl();
    else if (e.code === 'KeyJ') actions.journal();
    else if (e.code === 'Escape') actions.close();
    else {
      const n = /^(?:Digit|Numpad)([1-8])$/.exec(e.code)?.[1];
      if (n) actions.emoteKey(Number(n));
    }
  };
  const onUp = (e: KeyboardEvent) => {
    hold(() => held.delete(e.code));
    if (e.code === 'Space') {
      // A button presses on the space bar's letting go: in the play bar that press is the jump's (OP-293).
      if (inPlayBar(e)) e.preventDefault();
      actions.jumpEnd(eventTime(e));
    }
    // While Cmd is down, macOS sends no key-ups for the other keys: start afresh when it lifts.
    if (e.key === 'Meta') hold(() => held.clear());
  };
  const release = () => {
    hold(() => held.clear());
    actions.jumpEnd();
  };
  const onVisibility = () => {
    if (win.document.visibilityState !== 'visible') release();
  };
  win.addEventListener('keydown', onDown);
  win.addEventListener('keyup', onUp);
  win.addEventListener('blur', release);
  win.document.addEventListener('visibilitychange', onVisibility);
  // A text field taking the focus lets go of held keys: their key-ups go to the field.
  const stopTyping = releaseOnTyping(win.document, release);
  return {
    direction: () => heldDirection(held),
    rests: () => rests,
    detach() {
      win.removeEventListener('keydown', onDown);
      win.removeEventListener('keyup', onUp);
      win.removeEventListener('blur', release);
      win.document.removeEventListener('visibilitychange', onVisibility);
      stopTyping();
      held.clear();
    },
  };
}

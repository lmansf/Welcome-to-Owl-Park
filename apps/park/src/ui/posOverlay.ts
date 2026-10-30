/**
 * The position overlay (OP-138, `?pos=1`, for the park's keepers): where the room last said the own
 * owl stands (its welcome and the echoes of the owl's walks, the last five, with their age) beside
 * where the owl is drawn, and a red flash and a count each time the owl moves further than an owl's
 * width between two frames beyond what its walk covers in that time, which no walk does. It asks once
 * a tab for the keepers' key and checks it with the room server; without it nothing shows.
 *
 * TODO-DOCS (OP-138): docs/PLAYBOOK.md gets the overlay for a report of an owl jumping: `?pos=1`, the
 * keepers' key it asks for (checked with GET /api/admin/ping), what its lines mean, and the red flash.
 */
import { WALK_SPEED, type Vec2 } from '@owl-park/shared';

const KEY_STORE = 'owl-park:keepers-key';
/** Further than this between two frames, beyond the frame's walk, is a jump (room px): about an owl's width. */
export const JUMP_PX = 60;
/**
 * The longest frame whose walk is allowed for (ms). A frame a busy phone takes a quarter second over
 * carries a walk past an owl's width, and is no jump; the first frame after the tab slept is long
 * too, and a jump then is what the overlay is for.
 */
export const WALK_FRAME_MS = 600;
const SHOWN = 5;
/** How each thing the room said is listed: its welcome, the echo of a walk, and the owl moved to the room's spot (it could not follow, OP-138). */
const SAID = { welcome: 'room', echo: 'walk', moved: 'moved' } as const;
const FLASH_MS = 1200;
const REDRAW_MS = 250;

export interface PosOverlay {
  /** The room says the own owl stands at `to` (its welcome), or walks from `from` to `to` (an echo); or the owl was moved from `from` to the room's `to`, the room unable to walk it over. */
  told(kind: keyof typeof SAID, to: Vec2, from?: Vec2): void;
  /** The own owl as drawn this frame in `room`, at `now` (ms); going into another room is no jump. */
  frame(pos: Vec2, now: number, room: string): void;
  /** Jumps seen so far. */
  readonly jumps: number;
  destroy(): void;
}

const xy = (p: Vec2) => `${Math.round(p.x)},${Math.round(p.y)}`;

/**
 * Counts the own owl's jumps, frame by frame (`now` in ms): further between two frames in one room
 * than JUMP_PX beyond what a walk covers in that frame's time, up to WALK_FRAME_MS of it.
 */
export function jumpWatch(): { see(pos: Vec2, room: string, now: number): boolean; readonly count: number } {
  let last: { pos: Vec2; at: number } | null = null;
  let lastRoom = '';
  let count = 0;
  return {
    see(pos, room, now) {
      const walked = last ? (WALK_SPEED * Math.min(Math.max(now - last.at, 0), WALK_FRAME_MS)) / 1000 : 0;
      const jumped = room === lastRoom && last !== null && Math.hypot(pos.x - last.pos.x, pos.y - last.pos.y) > JUMP_PX + walked;
      if (jumped) count += 1;
      last = { pos: { ...pos }, at: now };
      lastRoom = room;
      return jumped;
    },
    get count() {
      return count;
    },
  };
}

function storedKey(): string | null {
  try {
    return sessionStorage.getItem(KEY_STORE);
  } catch {
    return null;
  }
}

function keepKey(key: string | null): void {
  try {
    if (key) sessionStorage.setItem(KEY_STORE, key);
    else sessionStorage.removeItem(KEY_STORE);
  } catch {
    /* no session storage: asked again next time */
  }
}

/** Ask for the keepers' key (once a tab) and check it with the room server at `base`; the overlay, or null. */
export async function openPosOverlay(base: string): Promise<PosOverlay | null> {
  const key = storedKey() ?? globalThis.prompt?.('Keepers’ key for the position overlay') ?? null;
  if (!key) return null;
  const ok = await fetch(`${base.replace(/\/$/, '')}/api/admin/ping`, { headers: { 'X-Admin-Key': key }, cache: 'no-store' })
    .then((r) => r.ok)
    .catch(() => false);
  keepKey(ok ? key : null);
  return ok ? mountPosOverlay() : null;
}

// Top left over the park, above the HUD; it never takes a tap.
const CSS = `
.pos-overlay{position:fixed;left:8px;top:8px;z-index:60;pointer-events:none;padding:6px 8px;border-radius:6px;white-space:pre;
  font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;color:#F6F1E3;background:rgba(12,30,54,.78);transition:background .2s}
.pos-overlay.jumped{background:rgba(200,30,40,.9)}
`;

/** The overlay's panel. */
export function mountPosOverlay(): PosOverlay {
  const style = document.createElement('style');
  style.textContent = CSS;
  const panel = document.createElement('div');
  panel.className = 'pos-overlay';
  panel.dataset.posOverlay = '';
  panel.setAttribute('aria-hidden', 'true');
  document.head.append(style);
  document.body.append(panel);
  const said: Array<{ kind: keyof typeof SAID; to: Vec2; from?: Vec2; at: number }> = [];
  const watch = jumpWatch();
  let flashUntil = 0;
  let drawnAt = 0;
  let here: Vec2 = { x: 0, y: 0 };
  const draw = (now: number) => {
    drawnAt = now;
    const lines = [`owl  ${xy(here)}`, `jumps ${watch.count}`, ...said.map((s) => `${SAID[s.kind]} ${s.from ? `${xy(s.from)} > ` : ''}${xy(s.to)}  ${((now - s.at) / 1000).toFixed(1)}s`)];
    panel.textContent = lines.join('\n');
    panel.classList.toggle('jumped', now < flashUntil);
  };
  return {
    told(kind, to, from) {
      said.unshift({ kind, to: { ...to }, ...(from ? { from: { ...from } } : {}), at: Date.now() });
      said.length = Math.min(said.length, SHOWN);
    },
    frame(pos, now, room) {
      here = { ...pos };
      if (watch.see(pos, room, now)) {
        flashUntil = now + FLASH_MS;
        draw(now);
      }
      if (now - drawnAt >= REDRAW_MS) draw(now);
    },
    get jumps() {
      return watch.count;
    },
    destroy() {
      panel.remove();
      style.remove();
    },
  };
}

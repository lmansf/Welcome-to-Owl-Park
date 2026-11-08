/**
 * The sealed hollow (OP-310), behind the `friends` flag: a co-op escape room for 2 to 4 owls, reached
 * by a doorway on the front edge of the grove's clearing. The room server keeps each group's run
 * (escape.ts in the shared package): this page only draws it, says where the owl stands, and sends
 * the steps. Nothing here knows a code, the key's shelf or which roots carry the carvings.
 *
 * Its pieces are plain boxes with their sizes written on them until their art is made; the locks,
 * the carvings and the key reuse the puzzle quests' marks (PuzzleMarker, OP-256).
 */
import type Phaser from 'phaser';
import {
  ESCAPE_DOOR,
  ESCAPE_LOCKS,
  ESCAPE_MAX_OWLS,
  ESCAPE_PERCH_TOP,
  ESCAPE_PLACES,
  ESCAPE_SHELVES,
  ESCAPE_STUMP,
  PUZZLE_REACH,
  distance,
  isEscapeRoom,
  sameLevel,
  type EscapeLockView,
  type EscapePaid,
  type EscapeView,
  type LockView,
  type PuzzleSymbol,
  type RoomDef,
  type ServerEscape,
  type Vec2,
} from '@owl-park/shared';
import { flagOn } from '../flags';
import type { EscapeLink } from '../net/transport';
import type { Hud } from '../ui/hud';
import { createCodePad, type CodePad } from '../ui/puzzle';
import { PuzzleMarker, markKey, type PuzzleMarkKind, type PuzzleMarkLook } from './PuzzleMarker';

/** What the words say (no phrase the owls type: chat stays the prewritten phrases). */
export const ESCAPE_WORDS = {
  door: 'Enter the sealed hollow',
  title: 'The sealed hollow',
  story: 'Nobody has opened this hollow since its last keeper flew away. The keeper left notes about the locks. Find the way out together.',
  restart: 'The park restarts every night: a run still going then ends, and your group starts again from the first lock.',
  wait: (n: number, min: number) => (n < min ? `Waiting for owls: ${n} here, ${min} needed to start.` : `${n} of ${ESCAPE_MAX_OWLS} owls here. Start when your group is ready.`),
  start: 'Start',
  back: 'Back to the clearing',
  tug: 'Tug the vine',
  dark: 'The moon carving is too dark to read. One owl must sit on the old stump while another reads it.',
  noKey: 'The round door needs its key. The keeper left it up on a shelf.',
  hintReady: 'The old owl by the entrance has a hint for you.',
  escaped: 'You escaped the sealed hollow!',
  feathers: (n: number) => `+${n} feathers`,
  paidToday: 'Today’s feathers for the hollow are already yours. Come back tomorrow for more.',
  practice: 'A practice run: spectators play for fun and earn nothing.',
  moth: 'You found the Hollow Moth! It waits in your collection.',
  offline: 'The sealed hollow needs the park’s server, which is not here right now.',
  started: 'That group has already started.',
  full: 'That group is full.',
  newGroup: 'Start a new group',
  join: (n: number) => `Join a group (${n} of ${ESCAPE_MAX_OWLS} owls)`,
  doorTitle: 'The sealed hollow: for 2 to 4 owls',
  doorStory: 'Wait inside for friends or owls nearby, then start together. About 10 minutes.',
} as const;

/** Each new piece, drawn as a box with its size until its art is made (w × h at the room's scale). */
const BOX = {
  door: { w: 130, h: 90, name: 'Hollow doorway' },
  root: { w: 90, h: 50, name: 'Root' },
  moon: { w: 180, h: 120, name: 'Moon carving' },
  vine: { w: 40, h: 160, name: 'Vine' },
  owl: { w: 70, h: 90, name: 'Old owl' },
  chest: { w: 100, h: 70, name: 'Keeper’s chest' },
  dial: { w: 90, h: 90, name: 'Moon dial' },
  rootDoor: { w: 140, h: 100, name: 'Root door' },
  roundDoor: { w: 120, h: 120, name: 'Round door' },
  note: { w: 60, h: 40, name: 'Keeper’s note' },
} as const;

const LINE = 0xf6f1e3;
const FILL = { plain: 0x4a3a2a, lit: 0x9fe8ff, ready: 0xffd36a, sign: 0x3f5b46 } as const;

/** A plain box standing on `foot` (its bottom middle), its name and size written on it. */
function sizeBox(scene: Phaser.Scene, foot: Vec2, box: { w: number; h: number; name: string }, fill: number = FILL.plain, label = box.name): Phaser.GameObjects.Container {
  const rect = scene.add.rectangle(0, -box.h / 2, box.w, box.h, fill, 0.55).setStrokeStyle(2, LINE, 0.9);
  const text = scene.add
    .text(0, -box.h / 2, `${label}\n${box.w}×${box.h}`, { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#F6F1E3', align: 'center' })
    .setOrigin(0.5);
  return scene.add.container(foot.x, foot.y, [rect, text]).setDepth(foot.y - 2);
}

/** A perch's middle. */
function middle(area: readonly Vec2[]): Vec2 {
  const xs = area.map((v) => v.x);
  const ys = area.map((v) => v.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

export interface EscapeHost {
  scene: Phaser.Scene;
  hud: Hud;
  /** The hollow's link (null until connected, or with no room server). */
  link(): EscapeLink | null;
  /** Where the own owl stands, and the top it stands on (0: the floor). */
  me(): { pos: Vec2; ground: number; walking: boolean };
  /** Into a hollow (from the doorway), or back out to the clearing. */
  goTo(room: string, spawn: string): void;
  feathers(total: number): void;
  awarded(): void;
  hudRoot(): HTMLElement | null;
}

const CSS = `
#hud .escape{position:fixed;top:calc(max(10px,env(safe-area-inset-top)) + 56px);left:50%;transform:translateX(-50%);width:min(440px,calc(100vw - 20px));display:flex;flex-direction:column;gap:6px;pointer-events:auto;background:rgba(12,30,54,.92);border:1px solid rgba(246,241,227,.18);border-radius:14px;padding:10px 12px;color:#F6F1E3;font-size:13px;box-shadow:0 6px 24px rgba(0,0,0,.45)}
#hud .escape h2{margin:0;font-size:15px}
#hud .escape p{margin:0;line-height:1.35}
#hud .escape .note{opacity:.85;font-style:italic}
#hud .escape .small{font-size:12px;opacity:.75}
#hud .escape .hint{color:#9FE8FF}
#hud .escape .row{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
#hud .escape button{min-height:36px;padding:6px 14px;border-radius:10px;border:1px solid rgba(246,241,227,.25);background:rgba(255,211,106,.18);color:#F6F1E3;font:inherit;cursor:pointer}
#hud .escape button:disabled{opacity:.45;cursor:default}
#hud .escape .pips{display:flex;gap:4px}
#hud .escape .pips i{width:10px;height:10px;border-radius:50%;background:rgba(246,241,227,.2)}
#hud .escape .pips i.on{background:#8FE3A8}
@media (max-height:520px){#hud .escape{top:8px;width:min(380px,calc(100vw - 20px));font-size:12px}}
`;
let styled = false;

function panel(root: HTMLElement): HTMLElement {
  if (!styled) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    styled = true;
  }
  const p = document.createElement('section');
  p.className = 'escape';
  p.setAttribute('aria-live', 'polite');
  root.appendChild(p);
  return p;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function button(label: string, run: () => void, disabled = false): HTMLButtonElement {
  const b = el('button', '', label);
  b.type = 'button';
  b.disabled = disabled;
  b.addEventListener('click', run);
  return b;
}

/** The pad takes a puzzle quest's lock: the hollow's code lock in that shape (the pad reads its name, length, clues and jam). */
function padLock(l: EscapeLockView): LockView {
  return { ...l, place: '', hint: '', hasKey: false, key: null, clues: l.clues.map((c) => ({ ...c, room: '' })) } as unknown as LockView;
}

// ---------- the doorway in the plaza ----------

/** The doorway on the clearing's front edge, drawn and offered only with `?friends=1`. */
export class EscapeDoorway {
  private readonly box: Phaser.GameObjects.Container;
  private sheet: HTMLElement | null = null;
  private asking = false;

  constructor(private readonly host: EscapeHost) {
    this.box = sizeBox(host.scene, { x: ESCAPE_DOOR.at.x, y: ESCAPE_DOOR.rect.y + ESCAPE_DOOR.rect.h }, BOX.door, FILL.sign, ESCAPE_DOOR.label);
  }

  /** Whether the owl stands in the doorway. */
  at(p: Vec2): boolean {
    const r = ESCAPE_DOOR.rect;
    return p.x >= r.x - 40 && p.x <= r.x + r.w + 40 && p.y >= r.y - 40 && p.y <= r.y + r.h + 60;
  }

  /** Ask the room for the groups waiting and a fresh hollow, and show them. */
  async open(): Promise<void> {
    if (this.asking) return;
    const link = this.host.link();
    if (!link) return this.host.hud.toast(ESCAPE_WORDS.offline, 4200);
    this.asking = true;
    const f = await link.ask('doors').finally(() => (this.asking = false));
    if (!f.ok || !f.doors) return this.host.hud.toast(f.reason === 'far' ? ESCAPE_DOOR.label : ESCAPE_WORDS.offline, 3600);
    const root = this.host.hudRoot();
    if (!root) return this.host.goTo(f.doors.fresh, 'default');
    this.close();
    const s = panel(root);
    s.dataset['escapeDoor'] = '';
    s.append(el('h2', '', ESCAPE_WORDS.doorTitle), el('p', '', ESCAPE_WORDS.doorStory));
    const row = el('div', 'row');
    for (const g of f.doors.groups) row.append(button(ESCAPE_WORDS.join(g.owls), () => this.enter(g.room)));
    row.append(button(ESCAPE_WORDS.newGroup, () => this.enter(f.doors!.fresh)), button('Close', () => this.close()));
    s.append(row, el('p', 'small', ESCAPE_WORDS.restart));
    this.sheet = s;
  }

  private enter(room: string): void {
    this.close();
    this.host.goTo(room, 'default');
  }

  close(): void {
    this.sheet?.remove();
    this.sheet = null;
  }

  destroy(): void {
    this.close();
    this.box.destroy();
  }
}

// ---------- the hollow itself ----------

/** How long before a step the room refused is asked again. */
const RETRY_MS = { far: 400, other: 4000 } as const;

export class EscapeHollow {
  private view: EscapeView | null = null;
  private readonly marks = new Map<string, PuzzleMarker>();
  private readonly moonBox: Phaser.GameObjects.Container;
  private readonly owlBox: Phaser.GameObjects.Container;
  private readonly sheet: HTMLElement | null;
  private readonly pad: CodePad | null;
  private readonly padSheet: Element | null;
  private readonly busy = new Map<string, number>();
  private padFor: string | null = null;
  private hintShown = false;
  private lastHint = '';
  private paid: EscapePaid | null = null;
  private saidAt = new Map<string, number>();
  private closed = false;
  private nextTick = 0;

  constructor(private readonly host: EscapeHost) {
    const { scene } = host;
    // The keeper's things, where the keeper left them: roots, the stump, the shelves, the vines, the carvings and the doors.
    for (const r of ESCAPE_PLACES.roots) sizeBox(scene, r, BOX.root);
    this.moonBox = sizeBox(scene, ESCAPE_PLACES.moon, BOX.moon);
    for (const v of ESCAPE_PLACES.vines) sizeBox(scene, v, BOX.vine, FILL.plain, `${BOX.vine.name} (${v.id})`);
    this.owlBox = sizeBox(scene, ESCAPE_PLACES.hintOwl, BOX.owl);
    const label = (at: Vec2, text: string, top: number) =>
      scene.add.text(at.x, at.y - top - 6, text, { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#F6F1E3', align: 'center' }).setOrigin(0.5, 1).setDepth(at.y + 1);
    const stump = middle(ESCAPE_STUMP.area);
    label(stump, `Old stump (perch)\n160×80`, ESCAPE_PERCH_TOP);
    for (const s of ESCAPE_SHELVES) label(middle(s.area), `Keeper’s shelf (perch)\n140×60`, ESCAPE_PERCH_TOP);
    const boxes = { chest: BOX.chest, dial: BOX.dial, roots: BOX.rootDoor, 'way-out': BOX.roundDoor } as const;
    for (const l of ESCAPE_LOCKS) sizeBox(scene, { x: l.post.x, y: l.post.y - 30 }, boxes[l.id]);
    const root = host.hudRoot();
    this.sheet = root ? panel(root) : null;
    this.sheet?.setAttribute('data-escape', '');
    this.pad = root ? createCodePad(root, (_q, lock, code) => this.tryCode(lock, code)) : null;
    this.padSheet = root?.lastElementChild ?? null;
    this.draw();
  }

  /** The link is up: the run as the room has it. */
  async connected(): Promise<void> {
    const link = this.host.link();
    if (!link) return this.say('offline', ESCAPE_WORDS.offline, 6000);
    const f = await link.ask('state');
    this.apply(f);
  }

  /** A push from the room: another owl moved the run, or the group got out. */
  onEscape(f: ServerEscape): void {
    this.apply(f);
  }

  private apply(f: ServerEscape): void {
    if (this.closed) return;
    if (f.view) this.view = f.view;
    if (f.hint) this.lastHint = f.hint;
    if (f.paid && !this.paid) this.gotPaid(f.paid);
    this.draw();
  }

  private gotPaid(p: EscapePaid): void {
    this.paid = p;
    if (p.total >= 0) this.host.feathers(p.total);
    if (p.item) this.host.awarded();
  }

  private async step(a: Parameters<EscapeLink['ask']>[0], args: Parameters<EscapeLink['ask']>[1] = {}): Promise<ServerEscape | null> {
    const link = this.host.link();
    if (!link) return null;
    const f = await link.ask(a, args);
    this.apply(f);
    return f;
  }

  /** Say a line, not more than once in `everyMs`. */
  private say(key: string, text: string, ms = 3600, everyMs = 8000): void {
    const now = Date.now();
    if (now < (this.saidAt.get(key) ?? 0)) return;
    this.saidAt.set(key, now + everyMs);
    this.host.hud.toast(text, ms);
  }

  private near(p: Vec2, top = 0): boolean {
    const me = this.host.me();
    return distance(me.pos, p) <= PUZZLE_REACH - 12 && sameLevel(me.ground, { top });
  }

  /** What the owl can do here with a button (E on a keyboard): tug a vine it stands at. */
  actions(): Array<{ id: string; label: string; run: () => void }> {
    const v = this.view;
    const roots = v?.locks.find((l) => l.id === 'roots');
    if (!v || v.phase !== 'running' || !roots?.available || roots.open) return [];
    return v.vines.filter((x) => this.near(x)).map((x) => ({ id: `escape-vine-${x.id}`, label: ESCAPE_WORDS.tug, run: () => void this.tug(x.id) }));
  }

  private async tug(vine: string): Promise<void> {
    const f = await this.step('tug', { vine });
    if (f?.opened === 'roots') this.host.hud.toast('The root door creaks open!', 3600, '#8FE3A8');
    else if (f?.ok) this.host.hud.toast('You tug the vine. The other one must be tugged at the same time!', 2600);
  }

  private async tryCode(lock: string, code: PuzzleSymbol[]): Promise<void> {
    const f = await this.step('open', { lock, code });
    if (!f) return;
    if (f.ok) {
      this.pad?.close();
      this.padFor = null;
      this.host.hud.toast(`${ESCAPE_LOCKS.find((l) => l.id === lock)?.name ?? 'The lock'} is open!`, 3600, '#8FE3A8');
    } else if (f.reason === 'wrong') this.pad?.note(f.left ? `Not that code. ${f.left} tries before it jams.` : 'Not that code. The lock jams for a moment.');
    else if (f.reason === 'jammed') this.pad?.note('The lock is jammed. Wait a moment.');
    else if (f.reason === 'far') this.pad?.note('Step up to the lock to try it.');
  }

  /** Each frame (a few times a second): work what the owl stands at. */
  tick(now: number): void {
    if (this.closed || now < this.nextTick) return;
    this.nextTick = now + 150;
    const v = this.view;
    if (!v) return;
    if (v.hint && !this.hintShown) this.say('hint', ESCAPE_WORDS.hintReady, 4200, 60_000);
    this.hintShown = v.hint;
    this.owlBox.setAlpha(v.hint ? 1 : 0.7);
    if (v.phase !== 'running' || !v.member) {
      this.closePad();
      return;
    }
    let atPad: string | null = null;
    for (const l of v.locks) {
      if (l.open || !l.available) continue;
      for (const c of l.id === 'chest' ? l.clues : []) if (!c.symbol && this.near(c)) this.work(`chest:${c.n}`, 'look', { lock: 'chest', n: c.n });
      if (l.id === 'dial' && !l.clues.some((c) => c.symbol) && this.near(ESCAPE_PLACES.moon)) this.work('dial', 'look', { lock: 'dial' });
      if (!this.near(l.post)) continue;
      if (l.kind === 'code') atPad = l.id;
      else if (l.kind === 'key') {
        if (v.hasKey) this.work('way-out', 'open', { lock: 'way-out' });
        else this.say('no-key', ESCAPE_WORDS.noKey);
      }
    }
    if (v.key && this.near(v.key, v.key.top)) this.work('key', 'take');
    if (v.hint && this.near(ESCAPE_PLACES.hintOwl)) this.work('hint', 'hint');
    if (atPad && atPad !== this.padFor) {
      const l = v.locks.find((x) => x.id === atPad)!;
      this.padFor = atPad;
      this.pad?.open('escape', padLock(l));
    } else if (!atPad) this.closePad();
  }

  private closePad(): void {
    if (!this.padFor) return;
    this.pad?.close();
    this.padFor = null;
  }

  /** Ask a step once, then not again until a moment after a refusal. */
  private work(key: string, a: 'look' | 'take' | 'open' | 'hint', args: Parameters<EscapeLink['ask']>[1] = {}): void {
    const at = this.busy.get(key);
    if (at !== undefined && Date.now() < at) return;
    this.busy.set(key, Number.POSITIVE_INFINITY);
    void this.step(a, args).then((f) => {
      if (!f?.ok) {
        this.busy.set(key, Date.now() + (f?.reason === 'far' ? RETRY_MS.far : RETRY_MS.other));
        if (f?.reason === 'dark') this.say('dark', ESCAPE_WORDS.dark, 4200);
        return;
      }
      this.busy.delete(key);
      if (a === 'look' && key === 'dial') this.host.hud.toast('The moon carving glows: three symbols for the moon dial!', 4200, '#9FE8FF');
      else if (a === 'look') this.host.hud.toast('A carving of the keeper’s: one symbol of the chest’s code.', 3600, '#9FE8FF');
      else if (a === 'take') this.host.hud.toast('You found the key to the round door!', 4200, '#FFD36A');
      else if (a === 'hint' && f.hint) this.host.hud.toast(f.hint, 9000, '#9FE8FF');
    });
  }

  /** Redraw the marks and the panel for the run as it stands. */
  private draw(): void {
    const v = this.view;
    const wanted = new Map<string, { lock: string; kind: PuzzleMarkKind; n: number; at: Vec2; top: number; look: PuzzleMarkLook }>();
    const add = (lock: string, kind: PuzzleMarkKind, n: number, at: Vec2, look: PuzzleMarkLook, top = 0) => wanted.set(markKey('escape', lock, kind, n), { lock, kind, n, at, top, look });
    if (v && v.phase !== 'lobby') {
      for (const l of v.locks) {
        add(l.id, 'lock', 0, l.post, { kind: 'lock', state: l.open ? 'open' : l.available ? 'ready' : 'waiting' });
        if (l.open || !l.available) continue;
        if (l.id === 'chest') for (const c of l.clues) add(l.id, 'clue', c.n, { x: c.x, y: c.y + 30 }, { kind: 'clue', symbol: c.symbol });
        if (l.id === 'dial' && (v.lit || l.clues.some((c) => c.symbol)))
          for (const c of l.clues) add(l.id, 'clue', c.n, { x: c.x - 50 + c.n * 50, y: c.y - BOX.moon.h - 10 }, { kind: 'clue', symbol: c.symbol });
      }
      if (v.key) add('way-out', 'key', 0, v.key, { kind: 'key' }, v.key.top);
    }
    for (const [key, m] of this.marks) {
      if (wanted.has(key)) continue;
      m.destroy();
      this.marks.delete(key);
    }
    for (const [key, w] of wanted) {
      const m = this.marks.get(key);
      if (m) m.setLook(w.look);
      else this.marks.set(key, new PuzzleMarker(this.host.scene, 'escape', w.lock, w.kind, w.n, w.at, w.top, w.look));
    }
    const lit = !!v?.lit;
    (this.moonBox.list[0] as Phaser.GameObjects.Rectangle).setFillStyle(lit ? FILL.lit : FILL.plain, lit ? 0.75 : 0.55);
    if (this.padFor && v) {
      const l = v.locks.find((x) => x.id === this.padFor);
      this.pad?.update(l?.available ? padLock(l) : null);
    }
    this.drawSheet();
  }

  private drawSheet(): void {
    const s = this.sheet;
    if (!s) return;
    const v = this.view;
    s.replaceChildren();
    s.append(el('h2', '', ESCAPE_WORDS.title));
    if (!v) {
      s.append(el('p', '', ESCAPE_WORDS.story));
      return;
    }
    s.dataset['phase'] = v.phase;
    if (v.phase === 'lobby') {
      s.append(el('p', '', ESCAPE_WORDS.story), el('p', '', ESCAPE_WORDS.wait(v.owls, v.min)));
      const row = el('div', 'row');
      row.append(button(ESCAPE_WORDS.start, () => void this.step('start'), !v.member || v.owls < v.min), button(ESCAPE_WORDS.back, () => this.leave()));
      s.append(row, el('p', 'small', ESCAPE_WORDS.restart));
      return;
    }
    if (v.phase === 'escaped') {
      s.append(el('p', '', ESCAPE_WORDS.escaped));
      const p = this.paid;
      if (p?.practice) s.append(el('p', '', ESCAPE_WORDS.practice));
      else if (p && p.feathers > 0) s.append(el('p', '', ESCAPE_WORDS.feathers(p.feathers)));
      else if (p?.why === 'paid-today') s.append(el('p', '', ESCAPE_WORDS.paidToday));
      if (p?.item) s.append(el('p', '', ESCAPE_WORDS.moth));
      const row = el('div', 'row');
      row.append(button(ESCAPE_WORDS.back, () => this.leave()));
      s.append(row);
      return;
    }
    const open = v.locks.filter((l) => l.open).length;
    const pips = el('div', 'pips');
    for (const l of v.locks) pips.append(el('i', l.open ? 'on' : ''));
    const now = v.locks.find((l) => !l.open);
    s.append(pips, el('p', '', `Lock ${Math.min(open + 1, v.locks.length)} of ${v.locks.length}: ${now?.name ?? ''}`));
    if (now) s.append(el('p', 'note', `Keeper’s note: “${now.note}”`));
    if (v.practice) s.append(el('p', 'small', ESCAPE_WORDS.practice));
    if (this.lastHint) s.append(el('p', 'hint', this.lastHint));
    else if (v.hint) s.append(el('p', 'hint', ESCAPE_WORDS.hintReady));
  }

  private leave(): void {
    this.host.goTo(ESCAPE_DOOR.room, 'from-escape');
  }

  /** For the browser tests: the run as this page has it. */
  debug(): { view: EscapeView | null; paid: EscapePaid | null; pad: string | null } {
    return { view: this.view, paid: this.paid, pad: this.padFor };
  }

  destroy(): void {
    this.closed = true;
    for (const m of this.marks.values()) m.destroy();
    this.marks.clear();
    this.pad?.close();
    this.padSheet?.remove();
    this.sheet?.remove();
  }
}

/** The hollow's controller in an escape room, the doorway's in its plaza: only with `?friends=1`. */
export function escapeFor(room: RoomDef, host: EscapeHost): { hollow: EscapeHollow | null; doorway: EscapeDoorway | null } {
  if (!flagOn('friends')) return { hollow: null, doorway: null };
  if (isEscapeRoom(room.id)) return { hollow: new EscapeHollow(host), doorway: null };
  if (room.id === ESCAPE_DOOR.room) return { hollow: null, doorway: new EscapeDoorway(host) };
  return { hollow: null, doorway: null };
}

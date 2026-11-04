/**
 * Puzzle quests in the HUD (OP-255): the run's box on a puzzle quest's card in the Quests tab (start a
 * run, join an owl close by, leave; each lock, where to look, the symbols read so far) and the code pad
 * a code lock opens when the owl walks up to it. The pad is tap only: six symbol buttons, a row of
 * slots, Clear and Try. Placeholder look (OP-256 brings the art): the symbols are drawn as emoji with
 * their names for screen readers. Nothing here knows a code: the room server checks every try.
 */
import { PUZZLE_SYMBOLS, type LockView, type PuzzleSymbol, type PuzzleView } from '@owl-park/shared';
import type { PuzzleNeighbour } from '../collect/service';
import { publishedArtUrl } from '../game/art';

export const SYMBOL_FACE: Record<PuzzleSymbol, string> = { moon: '🌙', leaf: '🍃', feather: '🪶', acorn: '🌰', star: '⭐', mushroom: '🍄' };
export const SYMBOL_WORD: Record<PuzzleSymbol, string> = { moon: 'Moon', leaf: 'Leaf', feather: 'Feather', acorn: 'Acorn', star: 'Star', mushroom: 'Mushroom' };

export const PUZZLE_CSS = `
#hud .pbox{display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:10px;background:rgba(159,232,255,.06);border:1px solid rgba(159,232,255,.18)}
#hud .pbox .prow{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;font-size:13px}
#hud .pbox .lock{display:flex;flex-direction:column;gap:2px;font-size:13px;padding:6px 8px;border-radius:8px;background:rgba(246,241,227,.05)}
#hud .pbox .lock.open{opacity:.6}
#hud .pbox .lock.waiting{opacity:.55}
#hud .pbox .lock b{font-size:13px}
#hud .pbox .lock .hint{font-size:12px;opacity:.85}
#hud .pbox .syms{display:flex;gap:4px;font-size:16px}
#hud .pbox .syms span{min-width:24px;text-align:center;border-radius:6px;background:rgba(246,241,227,.08)}
#hud .pbox button{min-height:34px;padding:5px 12px}
#hud .sheet.pad .slots{display:flex;gap:8px;justify-content:center;font-size:26px}
#hud .sheet.pad .slots span{width:44px;height:44px;display:grid;place-items:center;border-radius:10px;background:rgba(246,241,227,.08);border:1px solid rgba(246,241,227,.18)}
#hud .sheet.pad .keys{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
#hud .sheet.pad .keys button{min-height:52px;font-size:24px}
#hud .pbox .syms span .sym{width:22px;height:22px;vertical-align:middle}
#hud .sheet.pad .sym{width:32px;height:32px;vertical-align:middle;image-rendering:auto}
#hud .sheet.pad .found{font-size:13px;opacity:.9;text-align:center}
#hud .sheet.pad .row2{display:flex;gap:8px;justify-content:flex-end}
#hud .sheet.pad .note{font-size:13px;text-align:center;min-height:18px;color:#FFD36A}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function button(label: string, cls: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const b = el('button', cls, label);
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

/** A symbol as the pad shows it: its painted icon (OP-256) when this build ships it, the emoji otherwise. */
function symbolFace(s: PuzzleSymbol): HTMLElement | string {
  const url = publishedArtUrl(`kit-puzzle-symbol-${s}`);
  if (!url) return SYMBOL_FACE[s];
  const img = document.createElement('img');
  img.className = 'sym';
  img.src = url;
  img.alt = '';
  img.width = 32;
  img.height = 32;
  img.draggable = false;
  return img;
}

function symbolSpan(s: PuzzleSymbol | null): HTMLSpanElement {
  const span = el('span', '', s ? '' : '?');
  if (s) span.append(symbolFace(s));
  span.setAttribute('aria-label', s ? SYMBOL_WORD[s] : 'not found yet');
  return span;
}

/** What a lock's row says about where it stands. */
export function lockStatus(l: LockView, now = Date.now()): string {
  if (l.open) return l.mine ? 'Open' : 'Open (opened before you joined: open it in your own run to count it)';
  if (!l.available) return 'Opens once the locks before it are open';
  if (l.jammedUntil > now) return 'Jammed for a moment';
  if (l.kind === 'key') return l.hasKey ? `Key in hand: take it to ${l.place}` : 'Find its key';
  const read = l.clues.filter((c) => c.symbol).length;
  return `${read} of ${l.length} clues read`;
}

export interface PuzzleBoxActions {
  start(): void;
  join(owl: string): void;
  leave(): void;
  near(): void;
}

/** A puzzle quest's run on its card in the Quests tab. */
export function puzzleBox(view: PuzzleView | undefined, near: PuzzleNeighbour[] | undefined, act: PuzzleBoxActions, pending: boolean, nameOf: (owl: string) => string): HTMLElement {
  const box = el('div', 'pbox');
  box.dataset['puzzle'] = view?.puzzle ?? '';
  if (!view) {
    box.append(el('span', 'empty', 'Loading the puzzle…'));
    return box;
  }
  const head = el('div', 'prow');
  head.append(el('b', '', `${view.mine} of ${view.total} locks opened by you`));
  box.appendChild(head);
  if (!view.run) {
    head.append(button('Start a run', '', act.start, pending));
    box.appendChild(el('span', 'hint', 'Each run hides new clues and new codes. Start one alone, or join an owl next to you.'));
    const list = near ?? [];
    for (const n of list) {
      const row = el('div', 'prow');
      row.append(el('span', '', `${nameOf(n.owl)}: ${n.members} in the run, ${n.opened} open`), button('Join', 'ghost', () => act.join(n.owl), pending));
      box.appendChild(row);
    }
    box.appendChild(button(list.length ? 'Look again' : 'Find owls to join', 'ghost', act.near, pending));
    return box;
  }
  const run = el('div', 'prow');
  run.dataset['run'] = '';
  run.append(el('span', '', view.run.members === 1 ? 'You are in a run on your own' : `${view.run.members} owls in your run`), button('Leave', 'ghost', act.leave, pending));
  box.appendChild(run);
  for (const l of view.locks) {
    const row = el('div', `lock${l.open ? ' open' : l.available ? '' : ' waiting'}`);
    row.dataset['lock'] = l.id;
    row.append(el('b', '', `${l.name} · ${l.place}`), el('span', '', lockStatus(l)));
    if (!l.open && l.available) row.append(el('span', 'hint', l.hint));
    if (l.kind === 'code' && l.available && !l.open) {
      const syms = el('div', 'syms');
      for (const c of l.clues) syms.appendChild(symbolSpan(c.symbol));
      row.appendChild(syms);
    }
    box.appendChild(row);
  }
  return box;
}

export interface CodePad {
  open(quest: string, lock: LockView): void;
  /** The lock's view changed (a clue read by a friend, a jam): the pad redraws if it shows it. */
  update(lock: LockView | null): void;
  /** Tell the owl how the last try went. */
  note(text: string): void;
  close(): void;
  isOpen(): boolean;
  showing(): { quest: string; lock: string } | null;
}

/** The code pad: tap symbols into the slots, then Try. `tryCode` answers with the room's verdict. */
export function createCodePad(root: HTMLElement, tryCode: (quest: string, lock: string, code: PuzzleSymbol[]) => Promise<unknown>): CodePad {
  const sheet = el('section', 'sheet pad');
  sheet.setAttribute('aria-label', 'Code lock');
  root.appendChild(sheet);
  let quest = '';
  let lock: LockView | null = null;
  let code: PuzzleSymbol[] = [];
  let note = '';
  let pending = false;

  const draw = () => {
    if (!lock) return;
    const l = lock;
    sheet.innerHTML = '';
    sheet.dataset['lock'] = l.id;
    const h = el('header');
    h.append(el('h2', '', l.name), el('span', 'sub', `${l.length} symbols`), button('Close', 'ghost x', close));
    h.lastElementChild!.setAttribute('aria-label', `Step away from ${l.name}`);
    sheet.appendChild(h);
    const found = l.clues.filter((c) => c.symbol);
    sheet.appendChild(el('p', 'found', found.length ? `Clues read: ${found.map((c) => `${c.n + 1}. ${SYMBOL_WORD[c.symbol!]}`).join(', ')}` : 'No clues read yet. Each clue shows one symbol and its place in the code.'));
    const slots = el('div', 'slots');
    for (let i = 0; i < l.length; i++) slots.appendChild(symbolSpan(code[i] ?? null));
    slots.dataset['code'] = code.join(',');
    sheet.appendChild(slots);
    const keys = el('div', 'keys');
    const jammed = l.jammedUntil > Date.now();
    for (const s of PUZZLE_SYMBOLS) {
      const face = symbolFace(s);
      const b = button(typeof face === 'string' ? face : '', '', () => {
        if (code.length >= l.length) return;
        code = [...code, s];
        note = '';
        draw();
      }, pending || jammed || code.length >= l.length);
      if (typeof face !== 'string') b.append(face);
      b.setAttribute('aria-label', SYMBOL_WORD[s]);
      b.dataset['symbol'] = s;
      keys.appendChild(b);
    }
    sheet.appendChild(keys);
    sheet.appendChild(el('p', 'note', jammed ? 'The lock is jammed. Wait a moment.' : note));
    const row = el('div', 'row2');
    row.append(
      button('Clear', 'ghost', () => {
        code = [];
        note = '';
        draw();
      }, pending || !code.length),
      button('Try', '', () => void attempt(), pending || jammed || code.length !== l.length),
    );
    sheet.appendChild(row);
  };

  const attempt = async () => {
    if (!lock || pending) return;
    pending = true;
    draw();
    try {
      await tryCode(quest, lock.id, code);
    } finally {
      pending = false;
      code = [];
      draw();
    }
  };

  const close = () => {
    lock = null;
    sheet.classList.remove('open');
    delete sheet.dataset['lock'];
  };

  return {
    open(q, l) {
      quest = q;
      lock = l;
      code = [];
      note = '';
      sheet.classList.add('open');
      draw();
    },
    update(l) {
      if (!lock) return;
      if (!l || l.open) return close();
      lock = l;
      draw();
    },
    note(text) {
      note = text;
      draw();
    },
    close,
    isOpen: () => sheet.classList.contains('open'),
    showing: () => (lock ? { quest, lock: lock.id } : null),
  };
}

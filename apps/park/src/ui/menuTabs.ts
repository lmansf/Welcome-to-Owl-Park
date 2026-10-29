import { ARCADE_NAME, NEST_WORDS, WAY_OUT_WORDS, allVariants, parseVariant, setProgress, type ItemKind, type SetProgress } from '@owl-park/shared';
import type { CollectionState } from '../collect/state';
import { rasterNames } from '../game/artNames';
import { PUBLISHED_ART, versioned } from '../game/publishedArt';
import type { WalletEntry } from '../net/transport';
import type { SettingsStore } from '../settings';
import { ACCOUNT_WORDS } from './account';
import { HOME_WORDS } from './home';
import { settingsRows, syncSettings } from './settingsScreen';
import { walletLine } from './tickets';

/**
 * What the Menu's tabs show besides the quests (OP-108): the collection, the owl's nest, a map of
 * the park, and the settings with the ways out. Every word here is visitor-facing; places go by the
 * names the park shows (realm names stay out until they are public: a closed arch is "Coming soon").
 */

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

const card = (title: string, ...children: Array<Node | string>): HTMLElement => {
  const c = el('section', 'mcard');
  c.append(el('h3', '', title), ...children);
  return c;
};

const note = (text: string) => el('p', 'mnote', text);

const actionButton = (label: string, screen: string, onClick: () => void, ghost = false): HTMLButtonElement => {
  const b = el('button', ghost ? 'mbtn ghost' : 'mbtn', label);
  b.dataset['screen'] = screen;
  b.dataset['key'] = screen;
  b.addEventListener('click', onClick);
  return b;
};

/** How long Go home is held before the owl goes (OP-114): long enough that a stray tap mid-quest does nothing. */
const HOLD_MS = 350;
const HOLD_HINT = 'Hold to go home.';

/**
 * A button that acts once held for HOLD_MS, a fill running across it meanwhile (Go home, OP-114);
 * let go sooner and it empties, and `early` is told. A key's press is meant: it acts at once.
 */
const holdButton = (label: string, screen: string, onHold: () => void, early: () => void): HTMLButtonElement => {
  const b = el('button', 'mbtn hold', label);
  b.dataset['screen'] = screen;
  b.dataset['key'] = screen;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const letGo = (): boolean => {
    if (!timer) return false;
    clearTimeout(timer);
    timer = null;
    b.classList.remove('holding');
    return true;
  };
  b.addEventListener('pointerdown', () => {
    letGo();
    b.classList.add('holding');
    timer = setTimeout(() => {
      timer = null;
      b.classList.remove('holding');
      onHold();
    }, HOLD_MS);
  });
  b.addEventListener('pointerup', () => {
    if (letGo()) early();
  });
  for (const t of ['pointercancel', 'pointerleave'] as const) b.addEventListener(t, () => void letGo());
  b.addEventListener('click', (e) => {
    if (e.detail === 0) onHold();
  });
  b.addEventListener('contextmenu', (e) => e.preventDefault()); // a long press is the hold, not the browser's menu
  return b;
};

// ---------- Collection ----------

const KIND_NAMES: Record<ItemKind, string> = { wear: 'Things to wear', pet: 'Pets', fx: 'Effects', emote: 'Emotes' };
const KINDS: readonly ItemKind[] = ['wear', 'pet', 'fx', 'emote'];

/** How many variants of each kind there are (the catalogue changes only with a deploy). */
let totals: Record<ItemKind, number> | null = null;
function kindTotals(): Record<ItemKind, number> {
  if (!totals) {
    totals = { wear: 0, pet: 0, fx: 0, emote: 0 };
    for (const id of allVariants()) totals[parseVariant(id)!.item.kind]++;
  }
  return totals;
}

/** The owl's collection by kind: how many of each it has, of how many. */
export function collectionCounts(owned: readonly string[]): Array<{ kind: ItemKind; name: string; have: number; of: number }> {
  const have: Record<ItemKind, number> = { wear: 0, pet: 0, fx: 0, emote: 0 };
  for (const id of new Set(owned)) {
    const v = parseVariant(id);
    if (v) have[v.item.kind]++;
  }
  const of = kindTotals();
  return KINDS.map((kind) => ({ kind, name: KIND_NAMES[kind], have: have[kind], of: of[kind] }));
}

/** A bar for a share, with its words beside it (the share is never told by the bar alone). */
const meter = (have: number, of: number, label: string): HTMLElement => {
  const row = el('div', 'mmeter');
  const bar = el('span', 'bar');
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', label);
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(of));
  bar.setAttribute('aria-valuenow', String(have));
  const fill = el('i');
  fill.style.width = `${of ? Math.min(100, (have / of) * 100) : 0}%`;
  bar.appendChild(fill);
  row.append(el('span', 'what', label), el('b', '', `${have} of ${of.toLocaleString('en-US')}`), bar);
  return row;
};

export function renderCollection(panel: HTMLElement, state: CollectionState | null): void {
  if (!state?.inv) {
    panel.appendChild(note('Your collection shows here once the park has it.'));
    return;
  }
  const owned = state.inv.owned;
  const counts = collectionCounts(owned);
  const have = counts.reduce((a, c) => a + c.have, 0);
  const of = counts.reduce((a, c) => a + c.of, 0);
  const all = card('Your collection', meter(have, of, 'Collected'));
  all.dataset['collected'] = String(have);
  const feathers = el('p', 'mnote', `${state.inv.feathers} feathers to spend in the shop on the neon street.`);
  all.appendChild(feathers);
  panel.appendChild(all);
  const kinds = card('By kind');
  for (const c of counts) kinds.appendChild(meter(c.have, c.of, c.name));
  panel.appendChild(kinds);
  panel.appendChild(setsCard(setProgress(owned, state.inv.furniture ?? [])));
  panel.appendChild(note('Quests and the shop bring new things. Wear them at the mirror in your nest.'));
}

/**
 * A piece of furniture's painted art as the page serves it: the file the build ships (its WebP or PNG,
 * the 2x when asked for and there is one), with its content's hash, as the game's loader (game/art.ts) reads it.
 */
const pieceArt = (art: string, x2: boolean): string =>
  `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}art/${versioned(rasterNames(art, x2 ? 2 : 1, PUBLISHED_ART)[0] ?? `${art}.png`)}`;

/**
 * The style sets (OP-110): for each, how many of its pieces the owl has and which (a tick, not a
 * colour, marks the ones it has), and its capstone, a silhouette without a name until the set is
 * complete. While no set exists, a word about what is coming.
 */
export function setsCard(sets: readonly SetProgress[]): HTMLElement {
  if (!sets.length) return card('Sets', note('Each realm will bring its own set of things to collect and furnish your nest with. Your progress on each set will show here.'));
  const c = card('Sets');
  for (const s of sets) {
    const box = el('div', s.done ? 'mset done' : 'mset');
    box.dataset['style'] = s.style;
    box.appendChild(meter(s.have, s.of, s.name));
    const list = el('ul', 'mpieces');
    for (const p of s.pieces) list.appendChild(el('li', p.owned ? 'have' : '', p.owned ? `✓ ${p.name}` : p.name));
    box.appendChild(list);
    const cap = el('div', 'mcap');
    const img = el('img');
    img.src = pieceArt(s.capstone.art, false);
    img.srcset = `${pieceArt(s.capstone.art, true)} 2x`;
    img.alt = s.done ? s.capstone.name : 'A hidden piece';
    img.addEventListener('error', () => img.remove()); // no art yet: the words alone
    cap.append(img, note(s.done ? `Set complete! The ${s.capstone.name} is yours: find it in Decorate in your nest.` : 'Collect the whole set for a piece for your nest that only this set gives.'));
    box.appendChild(cap);
    c.appendChild(box);
  }
  return c;
}

// ---------- Nest ----------

export interface NestTabState {
  /** Away from the owl's own nest: "Go home" takes it there. */
  canGoHome: boolean;
  /** The owl's account (OP-139): its friend code and whether an email protects it. Null while accounts are off. */
  account?: HTMLElement[] | null;
}

export function renderNest(panel: HTMLElement, nest: NestTabState, goHome: () => void): void {
  if (nest.canGoHome) {
    const c = card(NEST_WORDS.yourNest, note('Your own room on the nests’ street: decorate it with your furniture, open it to visitors, and change how your owl looks at its mirror.'));
    // Going home is the Menu's, not the pad's (Logan, 2026-10-27), held as the pad's Nest was.
    const row = el('div', 'mrow');
    const hint = note(HOLD_HINT);
    hint.hidden = true;
    let hide: ReturnType<typeof setTimeout> | undefined;
    const tooQuick = () => {
      hint.hidden = false;
      clearTimeout(hide);
      hide = setTimeout(() => (hint.hidden = true), 2500);
    };
    row.appendChild(holdButton(WAY_OUT_WORDS.home, 'home', goHome, tooQuick));
    c.append(row, hint);
    panel.appendChild(c);
  } else {
    panel.appendChild(card(NEST_WORDS.yourNest, note('You are home. Tap Decorate to arrange your furniture and open your nest to visitors, or stand at the mirror to change how your owl looks.')));
  }
  if (nest.account) {
    const owl = card(ACCOUNT_WORDS.friendCode, ...nest.account);
    owl.dataset['account'] = '';
    panel.appendChild(owl);
  }
  panel.appendChild(card('Today’s furniture gift', note('A new piece for your nest every day: open Decorate in your nest to take it.')));
  panel.appendChild(card('Visiting', note('An open nest shows its owl’s flag on a door of the nests’ street: walk in to visit.')));
}

// ---------- Map ----------

/** A place on the map: where it sits on the map's grid (column, row) and what visitors call it. */
interface Place {
  id: string;
  name: string;
  col: number;
  row: number;
  /** A closed arch: shown, its name kept until it is public. */
  closed?: boolean;
}

/** The park as it stands: inside the turnstiles the great tree and what leads off it, outside the gate the nests. */
export const MAP_PLACES: readonly Place[] = [
  { id: 'closed-a', name: 'Coming soon', col: 0, row: 0, closed: true },
  // The stained-glass realm: its arch is boarded until the keepers open it; its name waits on its screening.
  { id: 'glass', name: 'Coming soon', col: 2, row: 0, closed: true },
  { id: 'grove', name: 'The treehouse clearing', col: 0, row: 1 },
  { id: 'hub', name: 'The great tree', col: 1, row: 1 },
  { id: 'market', name: 'The neon street', col: 2, row: 1 },
  { id: 'arcade', name: ARCADE_NAME, col: 2, row: 2 },
  { id: 'lobby', name: 'The front gate', col: 1, row: 2 },
  { id: 'homes', name: 'The nests’ street', col: 1, row: 3 },
  { id: 'nest', name: NEST_WORDS.yourNest, col: 1, row: 4 },
];

/** The paths between places, as the park's doorways join them. */
export const MAP_PATHS: ReadonlyArray<[string, string]> = [
  ['hub', 'closed-a'],
  ['hub', 'glass'],
  ['hub', 'grove'],
  ['hub', 'market'],
  ['market', 'arcade'],
  ['hub', 'lobby'],
  ['lobby', 'homes'],
  ['homes', 'nest'],
];

/** The map's place for a room the owl is in: any owl's nest is "a nest"; the owl's own is Your nest. */
export function mapPlaceOf(room: string, ownNest: boolean, open: readonly string[] = []): string | null {
  if (room.startsWith('nest-') || room === 'nest') return ownNest ? 'nest' : 'homes';
  return MAP_PLACES.some((p) => p.id === room && (!p.closed || open.includes(p.id))) ? room : null;
}

/** `open`: the gated realms the keepers have opened (the realms switch); their arches draw as doorways. */
export function renderMap(panel: HTMLElement, here: string | null, open: readonly string[] = []): void {
  const map = el('div', 'mmap');
  const cols = 3;
  const rows = 5;
  const at = new Map(MAP_PLACES.map((p) => [p.id, { ...p, closed: p.closed && !open.includes(p.id) }]));
  const lines = MAP_PATHS.map(([a, b]) => {
    const p = at.get(a)!;
    const q = at.get(b)!;
    return `<line x1="${p.col + 0.5}" y1="${p.row + 0.5}" x2="${q.col + 0.5}" y2="${q.row + 0.5}"${q.closed ? ' class="closed"' : ''}/>`;
  }).join('');
  map.innerHTML = `<svg class="paths" viewBox="0 0 ${cols} ${rows}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>`;
  for (const p of at.values()) {
    const pin = el('div', `pin${p.closed ? ' closed' : ''}${p.id === here ? ' here' : ''}`);
    pin.dataset['place'] = p.id;
    pin.style.gridColumn = String(p.col + 1);
    pin.style.gridRow = String(p.row + 1);
    pin.appendChild(el('span', 'name', p.name));
    if (p.id === here) pin.appendChild(el('b', 'you', 'You are here'));
    map.appendChild(pin);
  }
  panel.appendChild(map);
  panel.appendChild(note('Inside the turnstiles: the great tree, with the treehouse clearing and the neon street on either side, and Neon Roost off the neon street. Outside the gate: the nests’ street and your nest. The boarded arches open as new realms arrive.'));
}

// ---------- Settings ----------

export interface SettingsTabDeps {
  settings: SettingsStore;
  /** The tickets on this device, when the park's server keeps them (null: none to show here). */
  tickets(): Promise<WalletEntry[] | null>;
  /** Shown where the owl is: leaving the park (inside it). */
  canLeave: boolean;
  feedback(): void;
  title(): void;
  leave(): void;
  /** The owl's account (OP-139): where a grown-up protects the owl. Null while accounts are off. */
  account?: HTMLElement[] | null;
}

/** The tickets on this device, in a line each: for an owl asking the keepers about a ticket (OP-086). */
export function ticketLines(list: readonly WalletEntry[], now: number): string[] {
  if (!list.length) return ['No ticket on this device yet. A ticket belongs to the device that opened its link.'];
  return list.map((t) => {
    const w = walletLine(t, now);
    return `${w.title} ${t.id}: ${w.status}`;
  });
}

export function renderSettings(panel: HTMLElement, deps: SettingsTabDeps, redraw: () => void): void {
  const wrap = el('div', 'settings');
  wrap.append(...settingsRows(deps.settings, redraw));
  syncSettings(wrap, deps.settings.get());
  panel.appendChild(wrap);

  const tickets = card('Tickets on this device');
  tickets.dataset['tickets'] = '';
  const lines = el('div', 'mlines');
  lines.appendChild(note('Looking…'));
  tickets.appendChild(lines);
  panel.appendChild(tickets);
  void deps.tickets().then(
    (list) => {
      lines.innerHTML = '';
      if (!list) lines.appendChild(note('Tickets are kept by the park’s server, which this page is not using.'));
      else for (const line of ticketLines(list, Date.now())) lines.appendChild(note(line));
    },
    () => {
      lines.innerHTML = '';
      lines.appendChild(note('The tickets could not be checked just now.'));
    },
  );

  if (deps.account) {
    const owl = card(ACCOUNT_WORDS.friendCode, ...deps.account);
    owl.dataset['account'] = '';
    panel.appendChild(owl);
  }

  const help = card('Something wrong? An idea?', note('Tell the park’s keepers: they read every note.'));
  const helpRow = el('div', 'mrow');
  helpRow.appendChild(actionButton('Feedback', 'feedback', deps.feedback));
  help.appendChild(helpRow);
  panel.appendChild(help);

  const out = card('Leaving');
  const outRow = el('div', 'mrow');
  outRow.appendChild(actionButton(HOME_WORDS.menu, 'title', deps.title, true));
  if (deps.canLeave) outRow.appendChild(actionButton(WAY_OUT_WORDS.leave, 'leave', deps.leave, true));
  out.appendChild(outRow);
  panel.appendChild(out);
}

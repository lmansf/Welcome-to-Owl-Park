import { ARCADE_NAME, NEST_WORDS, TRAVEL_WORDS, WAY_OUT_WORDS, allVariants, canTravel, needsGate, parseVariant, setProgress, type ItemKind, type SetProgress, type TravelRefusal } from '@owl-park/shared';
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

/** How long a travel button is held before the owl goes (OP-114, OP-130): long enough that a stray tap mid-quest does nothing. */
const HOLD_MS = 350;

/**
 * A button that acts once held for HOLD_MS, a fill running across it meanwhile (travel, OP-130, as
 * Go home was, OP-114); let go sooner and it empties, and `early` is told. A key's press is meant: it
 * acts at once.
 */
const holdButton = (label: string, onHold: () => void, early: () => void): HTMLButtonElement => {
  const b = el('button', 'mbtn hold', label);
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
  /** Away from the owl's own nest: the Map travels it home. */
  away: boolean;
  /** The owl's account (OP-139): its friend code and whether an email protects it. Null while accounts are off. */
  account?: HTMLElement[] | null;
}

/** `toMap`: the Map tab with the owl's nest picked, where travel home is (OP-130; it was Go home here, OP-114). */
export function renderNest(panel: HTMLElement, nest: NestTabState, toMap: () => void): void {
  if (nest.away) {
    const c = card(NEST_WORDS.yourNest, note('Your own room on the nests’ street: decorate it with your furniture, open it to visitors, and change how your owl looks at its mirror. Your nest is always on the map, to travel home.'));
    const row = el('div', 'mrow');
    row.appendChild(actionButton('Open the map', 'map', toMap, true));
    c.appendChild(row);
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

/** Travel from the map (OP-130), as the Map tab shows it. */
export interface MapTravel {
  /** The places walked into; the owl's own nest is always there to travel to. */
  places: readonly string[];
  /** Whether the owl has walked through the front gate since it was last outside the park. */
  gate: boolean;
  /** Places lit since this device last showed them lit: they sparkle. */
  fresh: readonly string[];
  /** The place whose card is open, if any. */
  picked: string | null;
  pick(place: string): void;
  /** Its travel button held to the end: null when the owl is on its way, otherwise why not. */
  go(place: string): TravelRefusal | null;
}

/** What a place's card says, and the travel it offers: its button's words and the place it travels to. */
export interface PlaceCard {
  line: string | null;
  button: { label: string; to: string } | null;
}

/** What a travel the owl could not take says on the card. */
export const REFUSAL_WORDS: Readonly<Record<TravelRefusal, string>> = {
  here: TRAVEL_WORDS.youAreHere,
  'not-yet': TRAVEL_WORDS.notYet,
  gate: TRAVEL_WORDS.gateFirst,
  busy: TRAVEL_WORDS.busy,
};

/**
 * A place's card on the map (OP-130), from where the owl is (`here`) and what it has walked into.
 * The nest always travels home and any other place once walked into. Into the park is only through
 * the front gate: the great tree's card travels to the gate, outside the turnstiles, and a place
 * inside the park offers the gate instead until the owl has walked through it.
 */
export function placeCard(place: string, here: string | null, travel: { places: readonly string[]; gate: boolean }): PlaceCard {
  if (place === here) return { line: TRAVEL_WORDS.youAreHere, button: null };
  if (place === 'nest') return { line: null, button: { label: TRAVEL_WORDS.home, to: 'nest' } };
  if (!canTravel(place, travel.places)) return { line: TRAVEL_WORDS.notYet, button: null };
  // Both land outside the turnstiles; whichever the owl has walked into.
  const gateWay = here === 'lobby' ? undefined : (['hub', 'lobby'] as const).find((p) => canTravel(p, travel.places));
  const toGate = gateWay ? { label: TRAVEL_WORDS.gate, to: gateWay } : null;
  if (place === 'hub') return here === 'lobby' ? { line: TRAVEL_WORDS.atGate, button: null } : { line: TRAVEL_WORDS.throughGate, button: toGate };
  if (place === 'lobby') return { line: null, button: toGate };
  if (needsGate(place) && !travel.gate) return { line: TRAVEL_WORDS.gateFirst, button: toGate };
  return { line: null, button: { label: TRAVEL_WORDS.here, to: place } };
}

/** Places of the map this device has shown lit (OP-130), so a place walked into sparkles the first time. */
export const MAP_LIT_KEY = 'owl-park:map-lit';

/** The places walked into that this device has not shown lit yet; from now on they count as shown. Nothing sparkles where the browser keeps nothing. */
export function newlyLit(storage: Pick<Storage, 'getItem' | 'setItem'> | null, places: readonly string[]): string[] {
  if (!storage) return [];
  try {
    const raw: unknown = JSON.parse(storage.getItem(MAP_LIT_KEY) ?? '[]');
    const shown = Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string') : [];
    const fresh = places.filter((p) => !shown.includes(p));
    if (fresh.length) storage.setItem(MAP_LIT_KEY, JSON.stringify([...shown, ...fresh]));
    return fresh;
  } catch {
    return [];
  }
}

/**
 * `open`: the gated realms the keepers have opened (the realms switch); their arches draw as doorways.
 * With `travel` (OP-130) each open place is a button: lit once walked into (the nest always), and a
 * tap opens its card below the map, with the hold that travels.
 */
export function renderMap(panel: HTMLElement, here: string | null, open: readonly string[] = [], travel: MapTravel | null = null): void {
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
  const cardBox = el('div', 'mtravel');
  cardBox.setAttribute('aria-live', 'polite');
  let picked = travel?.picked ?? null;
  const drawCard = () => {
    cardBox.replaceChildren();
    const place = picked ? at.get(picked) : undefined;
    if (!travel || !place || place.closed) return;
    const what = placeCard(place.id, here, travel);
    const box = card(place.name);
    box.dataset['travelCard'] = place.id;
    const said = note(what.line ?? '');
    said.hidden = !what.line;
    said.dataset['travelLine'] = '';
    box.appendChild(said);
    const go = what.button;
    if (go) {
      const hint = note(TRAVEL_WORDS.hold);
      hint.hidden = true;
      let hide: ReturnType<typeof setTimeout> | undefined;
      const tooQuick = () => {
        hint.hidden = false;
        clearTimeout(hide);
        hide = setTimeout(() => (hint.hidden = true), 2500);
      };
      const b = holdButton(
        go.label,
        () => {
          const why = travel.go(go.to);
          if (!why) return;
          said.textContent = REFUSAL_WORDS[why];
          said.hidden = false;
        },
        tooQuick,
      );
      b.dataset['travel'] = go.to;
      b.dataset['key'] = 'travel';
      const row = el('div', 'mrow');
      row.appendChild(b);
      box.append(row, hint);
    }
    cardBox.appendChild(box);
  };
  for (const p of at.values()) {
    const tappable = travel !== null && !p.closed;
    const lit = tappable && (p.id === 'nest' || canTravel(p.id, travel.places));
    const pin = el(tappable ? 'button' : 'div', `pin${p.closed ? ' closed' : ''}${p.id === here ? ' here' : ''}${tappable && !lit ? ' unlit' : ''}`);
    pin.dataset['place'] = p.id;
    pin.style.gridColumn = String(p.col + 1);
    pin.style.gridRow = String(p.row + 1);
    pin.appendChild(el('span', 'name', p.name));
    if (p.id === here) pin.appendChild(el('b', 'you', 'You are here'));
    if (tappable) {
      pin.dataset['key'] = `pin-${p.id}`;
      if (lit) pin.dataset['lit'] = '';
      pin.classList.toggle('picked', picked === p.id);
      pin.setAttribute('aria-pressed', String(picked === p.id));
      if (travel.fresh.includes(p.id)) {
        pin.classList.add('new');
        const spark = el('i', 'spark', '✦');
        spark.setAttribute('aria-hidden', 'true');
        pin.appendChild(spark);
      }
      pin.addEventListener('click', () => {
        picked = p.id;
        travel.pick(p.id);
        for (const other of map.querySelectorAll<HTMLElement>('button.pin')) {
          const on = other.dataset['place'] === p.id;
          other.classList.toggle('picked', on);
          other.setAttribute('aria-pressed', String(on));
        }
        drawCard();
        cardBox.scrollIntoView?.({ block: 'nearest' });
      });
    }
    map.appendChild(pin);
  }
  panel.appendChild(map);
  panel.appendChild(cardBox);
  drawCard();
  if (travel) panel.appendChild(note(TRAVEL_WORDS.map));
  panel.appendChild(note('Inside the turnstiles: the great tree, with the treehouse clearing and the neon street on either side, and Neon Roost off the neon street. Outside the gate: the nests’ street and your nest. The boarded arches open as new realms arrive.'));
}

// ---------- Settings ----------

export interface SettingsTabDeps {
  settings: SettingsStore;
  /** The tickets on this device, when the park's server keeps them (null: none to show here). */
  tickets(): Promise<WalletEntry[] | null>;
  /** Shown where the owl is: leaving the park (inside it). */
  canLeave: boolean;
  /** Opens the Feedback form: Send feedback, the tab's first row (OP-167). */
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
  // Send feedback is the first row (OP-167), as it is in the home screen's Settings.
  wrap.append(...settingsRows(deps.settings, redraw, deps.feedback));
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

  const out = card('Leaving');
  const outRow = el('div', 'mrow');
  outRow.appendChild(actionButton(HOME_WORDS.menu, 'title', deps.title, true));
  if (deps.canLeave) outRow.appendChild(actionButton(WAY_OUT_WORDS.leave, 'leave', deps.leave, true));
  out.appendChild(outRow);
  panel.appendChild(out);
}

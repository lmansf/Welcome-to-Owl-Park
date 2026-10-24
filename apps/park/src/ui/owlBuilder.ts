import {
  ACCENT_COLOURS,
  BELLY_COLOURS,
  BODY_COLOURS,
  CATALOGUE,
  RARITY_COLOURS,
  RARITY_NAMES,
  colourwaysFor,
  equipSlotOf,
  getSpecies,
  parseVariant,
  selectableSpecies,
  variantId,
  variantName,
  type EquipSlot,
  type ItemDef,
  type OwlLook,
  type Wear,
} from '@owl-park/shared';
import type { CollectionState } from '../collect/state';
import { dotColour, variantIcon } from './itemIcon';
import { createModal, modalHeader } from './modal';

/** The owl builder's parts. */
export type BuilderTab = 'kind' | 'colours' | 'wear' | 'pets' | 'effects';

/** The preview's frame in CSS pixels (the game draws the owl there). */
export interface PreviewFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OwlBuilderActions {
  /** Wear a variant in its slot, or take the slot off (null). */
  equip(slot: EquipSlot, variant: string | null): void;
  /** What the owl wears right now. */
  wear(): Wear | undefined;
  /** The owl's kind and colours changed. */
  changeLook(look: OwlLook): void;
  /** Where to draw the owl while the builder is open, and whether it is open at a mirror (the room's own owl is the preview); null when it closes. */
  preview(frame: PreviewFrame | null, mirror: boolean): void;
}

export interface OwlBuilder {
  /** `fromMenu` adds the way back to the Menu; `mirror`: opened at a nest's mirror (OP-077), the room showing round the owl. */
  open(fromMenu: boolean, tab?: BuilderTab, opener?: HTMLElement | null, mirror?: boolean): void;
  close(): void;
  isOpen(): boolean;
  /** Called after it closes, whichever way. */
  onClose(cb: () => void): void;
  /** The look changed elsewhere (another tab, the server). */
  setLook(look: OwlLook): void;
}

const TABS: ReadonlyArray<[BuilderTab, string]> = [
  ['kind', 'Kind'],
  ['colours', 'Colours'],
  ['wear', 'Wear'],
  ['pets', 'Pets'],
  ['effects', 'Effects'],
];

const SLOT_WORDS: Record<'head' | 'face' | 'neck', string> = { head: 'On the head', face: 'On the face', neck: 'Round the neck' };
const COLOUR_ROWS: ReadonlyArray<[keyof Pick<OwlLook, 'body' | 'belly' | 'accent'>, string, readonly string[]]> = [
  ['body', 'Feathers', BODY_COLOURS],
  ['belly', 'Belly', BELLY_COLOURS],
  ['accent', 'Tufts and feet', ACCENT_COLOURS],
];

/** A word for a kind's size next to the great horned owl. */
export function sizeWord(size: number): string {
  return size >= 0.97 ? 'Big' : size >= 0.85 ? 'Medium' : size >= 0.7 ? 'Small' : 'Tiny';
}

const CSS = `
#hud .layer.full .scrim{background:transparent}
#hud .builder{display:grid;grid-template-rows:auto 1fr;height:100%}
#hud .builder > header{padding:max(10px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) 10px max(14px,env(safe-area-inset-left));background:linear-gradient(rgba(12,30,54,.92),rgba(12,30,54,.6));z-index:1}
#hud .builder > header .x{background:#C9A227;color:#0C1E36;border:0}
#hud .builder .b-body{display:grid;grid-template-columns:minmax(0,1fr) min(460px,46vw);min-height:0}
#hud .builder .b-stage{position:relative;min-height:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:18px}
#hud .builder .b-name{margin:0;padding:6px 14px;border-radius:999px;background:rgba(12,30,54,.7);border:1px solid rgba(246,241,227,.18);font-size:14px;font-weight:700}
#hud .builder .b-panel{display:flex;flex-direction:column;gap:12px;min-height:0;padding:14px max(14px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) 14px;background:rgba(12,30,54,.97);border-left:1px solid rgba(246,241,227,.14)}
#hud .builder .b-content{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:12px;padding:2px;overscroll-behavior:contain}
#hud .builder h3{margin:0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.7}
#hud .builder .kinds{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
#hud .builder .kind{display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-height:76px;padding:10px 12px;border-radius:14px;text-align:left;background:rgba(246,241,227,.07);color:#F6F1E3;border:1px solid rgba(246,241,227,.16);box-shadow:none}
#hud .builder .kind[aria-pressed=true]{background:rgba(201,162,39,.25);border-color:#FFD36A;box-shadow:inset 0 0 0 1px #FFD36A}
#hud .builder .kind b{font-size:15px}
#hud .builder .kind small{font-size:12px;opacity:.8;font-weight:400}
#hud .builder .kind .tri{display:flex;gap:4px}
#hud .builder .kind .tri i{width:14px;height:14px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.3)}
#hud .builder .swatches{display:flex;gap:9px;flex-wrap:wrap}
#hud .builder .sw{width:40px;height:40px;min-height:0;padding:0;border-radius:50%;border:3px solid transparent;box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)}
#hud .builder .sw.on{border-color:#F6F1E3;transform:scale(1.08)}
#hud .builder .natural{align-self:flex-start;min-height:40px}
#hud .builder .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(98px,1fr));gap:8px}
#hud .builder .card{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 6px 6px;border-radius:14px;background:rgba(246,241,227,.06);border:1px solid rgba(246,241,227,.12);color:#F6F1E3;box-shadow:none;min-height:0;font-weight:400}
#hud .builder .card.sel{border-color:#F6F1E3}
#hud .builder .card.worn{background:rgba(201,162,39,.22);box-shadow:inset 0 0 0 2px #C9A227}
#hud .builder .card canvas{width:64px;height:48px;pointer-events:none}
#hud .builder .card.none canvas{opacity:.28;filter:grayscale(1)}
#hud .builder .card .nm{font-size:11.5px;text-align:center;line-height:1.2;min-height:28px;pointer-events:none}
#hud .builder .card .on-tag{position:absolute;top:5px;right:6px;font:800 10px/1 system-ui,sans-serif;color:#0C1E36;background:#FFD36A;border-radius:6px;padding:2px 4px}
#hud .builder .dots{display:flex;flex-wrap:wrap;gap:4px;justify-content:center}
#hud .builder .dots i{width:11px;height:11px;border-radius:50%;border:1.5px solid currentColor;display:block;opacity:.75;cursor:pointer}
#hud .builder .dots i.own{background:currentColor;opacity:1}
#hud .builder .dots i.cur{outline:2px solid #F6F1E3;outline-offset:1px}
#hud .builder .b-detail{display:flex;align-items:center;gap:10px;min-height:48px;padding:8px 10px;border-radius:14px;background:rgba(246,241,227,.06);flex-wrap:wrap}
#hud .builder .b-detail .what{flex:1;min-width:150px;font-size:13px;line-height:1.3}
#hud .builder .b-detail .what b{display:block;font-size:14.5px}
#hud .builder .b-detail button{min-height:40px}
@media (max-width:820px),(orientation:portrait){
  #hud .builder .b-body{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(150px,38%) minmax(0,1fr)}
  #hud .builder .b-panel{border-left:0;border-top:1px solid rgba(246,241,227,.14);border-radius:22px 22px 0 0;padding:12px 12px max(12px,env(safe-area-inset-bottom))}
  #hud .builder .b-stage{padding-bottom:8px}
  #hud .builder .b-name{font-size:13px;padding:4px 12px}
  #hud .builder nav.tabs{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
  #hud .builder nav.tabs button{flex:none;padding:6px 12px}
}
`;

/**
 * The owl builder: the whole screen, the owl big and alive on one side (the game draws it, see
 * game/BuilderScene.ts) and its parts on the other: its kind, its colours, and what it wears, its
 * pet and its effect from the collection (things not yet owned show greyed, with where to find them).
 * Everything changes on the owl at once.
 */
export function createOwlBuilder(root: HTMLElement, state: CollectionState, actions: OwlBuilderActions, initialLook: OwlLook, back: () => void): OwlBuilder {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const modal = createModal(root, { name: 'builder', label: 'Your owl', layout: 'full' });
  const box = modal.box;
  let look: OwlLook = { ...initialLook };
  let tab: BuilderTab = 'kind';
  let fromMenu = false;
  /** The colourway picked per item (a dot tapped), and the variant shown in the detail line. */
  const pick = new Map<string, number>();
  let selected: string | null = null;

  box.innerHTML = `
    <div class="b-body">
      <div class="b-stage" data-stage><p class="b-name" data-kind-name></p></div>
      <div class="b-panel">
        <nav class="tabs" role="tablist" data-tabs></nav>
        <div class="b-content" role="tabpanel" data-content></div>
        <div class="b-detail" data-detail></div>
      </div>
    </div>`;
  const $ = <T extends Element>(sel: string) => box.querySelector(sel) as T;
  const stage = $<HTMLElement>('[data-stage]');
  const kindName = $<HTMLElement>('[data-kind-name]');
  const tabsEl = $<HTMLElement>('[data-tabs]');
  const content = $<HTMLElement>('[data-content]');
  const detail = $<HTMLElement>('[data-detail]');

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  };
  const button = (label: string, cls: string, onClick: () => void): HTMLButtonElement => {
    const b = el('button', cls, label);
    b.addEventListener('click', onClick);
    return b;
  };

  const setLook = (next: OwlLook) => {
    look = next;
    actions.changeLook(look);
    render();
  };

  const renderHead = () => {
    const inv = state.inv;
    const h = modalHeader('Your owl', {
      sub: inv ? `${state.count} of ${state.total} collected · ${inv.feathers} feathers` : 'Loading your collection…',
      onBack: fromMenu ? back : null,
      onClose: () => modal.close(),
      closeLabel: 'Done: close your owl',
    });
    h.querySelector<HTMLButtonElement>('[data-close]')!.textContent = 'Done';
    box.querySelector(':scope > header')?.remove();
    box.prepend(h);
  };

  const renderTabs = () => {
    tabsEl.innerHTML = '';
    for (const [id, label] of TABS) {
      const b = button(label, '', () => {
        tab = id;
        selected = null;
        render();
      });
      b.dataset['tab'] = id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(id === tab));
      tabsEl.appendChild(b);
    }
  };

  const renderKinds = () => {
    const current = getSpecies(look.species).id;
    const grid = el('div', 'kinds');
    for (const sp of selectableSpecies()) {
      const b = button('', 'kind', () => setLook({ ...look, species: sp.id }));
      b.dataset['species'] = sp.id;
      b.setAttribute('aria-pressed', String(sp.id === current));
      b.setAttribute('aria-label', sp.name);
      const tri = el('span', 'tri');
      for (const c of [sp.natural.body, sp.natural.belly, sp.natural.accent]) {
        const i = el('i');
        i.style.background = c;
        tri.appendChild(i);
      }
      b.append(el('b', '', sp.name.replace(/ owl$/, '')), el('small', '', sizeWord(sp.size)), tri);
      grid.appendChild(b);
    }
    content.append(el('h3', '', 'Kind of owl'), grid);
  };

  const renderColours = () => {
    for (const [part, title, colours] of COLOUR_ROWS) {
      const row = el('div', 'swatches');
      row.dataset['sw'] = part;
      for (const c of colours) {
        const b = button('', `sw${look[part] === c ? ' on' : ''}`, () => setLook({ ...look, [part]: c }));
        b.style.background = c;
        b.dataset['part'] = part;
        b.dataset['colour'] = c;
        b.setAttribute('aria-label', `${title} ${c}`);
        b.setAttribute('aria-pressed', String(look[part] === c));
        row.appendChild(b);
      }
      content.append(el('h3', '', title), row);
    }
    content.appendChild(button('Natural colours', 'ghost natural', () => setLook({ ...look, ...getSpecies(look.species).natural })));
  };

  const ownedVariantsOf = (item: ItemDef) => colourwaysFor(item.kind).map((c) => `${item.id}~${c.n}`).filter((v) => state.owns(v));

  /** Tap a card: wear its colourway (or take it off when it is on); not owned, say where to find it. */
  const tapItem = (item: ItemDef, variant: string) => {
    selected = variant;
    const v = parseVariant(variant);
    const slot = v ? equipSlotOf(v) : null;
    if (v && slot && state.owns(variant)) actions.equip(slot, actions.wear()?.[slot] === variant ? null : variant);
    render();
  };

  const card = (item: ItemDef, worn: Set<string>): HTMLElement => {
    const owned = ownedVariantsOf(item);
    const ways = colourwaysFor(item.kind);
    const firstOwned = owned[0] ? (parseVariant(owned[0])?.colour?.n ?? 0) : 0;
    const wornHere = owned.find((o) => worn.has(o));
    const n = pick.get(item.id) ?? (wornHere ? (parseVariant(wornHere)?.colour?.n ?? firstOwned) : firstOwned);
    const variant = variantId(item.id, n);
    const c = button('', `card${owned.length ? '' : ' none'}${selected === variant ? ' sel' : ''}${worn.has(variant) ? ' worn' : ''}`, () => tapItem(item, variant));
    c.dataset['item'] = item.id;
    c.setAttribute('aria-label', `${variantName(variant)}${worn.has(variant) ? ', on' : owned.includes(variant) ? '' : ', not yet yours'}`);
    c.setAttribute('aria-pressed', String(worn.has(variant)));
    c.append(variantIcon(variant), el('span', 'nm', item.name));
    if (worn.has(variant)) c.appendChild(el('span', 'on-tag', 'ON'));
    if (ways.length > 1) {
      const dots = el('span', 'dots');
      for (const w of ways) {
        const id = `${item.id}~${w.n}`;
        const d = el('i', `${state.owns(id) ? 'own' : ''}${w.n === n ? ' cur' : ''}`);
        d.style.color = dotColour(item, w.n);
        d.title = variantName(id);
        d.addEventListener('click', (ev) => {
          ev.stopPropagation();
          pick.set(item.id, w.n);
          tapItem(item, id);
        });
        dots.appendChild(d);
      }
      c.appendChild(dots);
    }
    return c;
  };

  const renderItems = (kind: 'wear' | 'pet' | 'fx') => {
    const worn = new Set(Object.values(actions.wear() ?? {}));
    const items = CATALOGUE.filter((i) => i.kind === kind);
    if (kind === 'wear') {
      for (const slot of ['head', 'face', 'neck'] as const) {
        const grid = el('div', 'grid');
        for (const item of items.filter((i) => i.kind === 'wear' && i.slot === slot)) grid.appendChild(card(item, worn));
        content.append(el('h3', '', SLOT_WORDS[slot]), grid);
      }
      return;
    }
    const grid = el('div', 'grid');
    for (const item of items) grid.appendChild(card(item, worn));
    content.append(el('h3', '', kind === 'pet' ? 'A pet to walk with you' : 'An effect around you'), grid);
  };

  const renderDetail = () => {
    detail.innerHTML = '';
    const sp = getSpecies(look.species);
    if (tab === 'kind' || tab === 'colours' || !selected) {
      const words =
        tab === 'kind'
          ? `${sp.name}. Each kind has its own size and natural colours.`
          : tab === 'colours'
            ? 'Pick colours for the feathers, the belly, and the tufts and feet.'
            : 'Tap something to put it on, and again to take it off. The dots are its other colourways.';
      detail.appendChild(el('div', 'what', words));
      return;
    }
    const v = parseVariant(selected);
    if (!v) return;
    const what = el('div', 'what');
    const rarity = el('span', '', RARITY_NAMES[v.rarity]);
    rarity.style.color = RARITY_COLOURS[v.rarity];
    what.append(el('b', '', variantName(selected)), rarity);
    detail.appendChild(what);
    const sel = selected;
    const slot = equipSlotOf(v);
    if (!state.owns(sel)) detail.appendChild(el('div', 'what', 'Not yet yours: earn it on a quest, or look for it in the feather shop.'));
    else if (slot) {
      const on = actions.wear()?.[slot] === sel;
      detail.appendChild(
        button(on ? 'Take off' : 'Put on', on ? 'ghost' : '', () => {
          actions.equip(slot, on ? null : sel);
          render();
        }),
      );
    }
  };

  const render = () => {
    if (!modal.isOpen()) return;
    const keep = content.scrollTop;
    // A redraw replaces the buttons: the keyboard's focus goes back to the one in the same place.
    const buttons = () => [...box.querySelectorAll<HTMLElement>('button')];
    const focused = buttons().indexOf(document.activeElement as HTMLElement);
    renderHead();
    renderTabs();
    content.innerHTML = '';
    if (tab === 'kind') renderKinds();
    else if (tab === 'colours') renderColours();
    else renderItems(tab === 'wear' ? 'wear' : tab === 'pets' ? 'pet' : 'fx');
    content.scrollTop = keep;
    kindName.textContent = getSpecies(look.species).name;
    renderDetail();
    if (focused >= 0) buttons()[focused]?.focus({ preventScroll: true });
  };

  /** Opened at a nest's mirror: the room's own owl is the preview, drawn in the stage by the room's camera. */
  let atMirror = false;
  const frame = () => {
    if (!modal.isOpen()) return;
    const r = stage.getBoundingClientRect();
    actions.preview({ x: r.left, y: r.top, w: r.width, h: r.height }, atMirror);
  };
  const watcher = typeof ResizeObserver === 'function' ? new ResizeObserver(frame) : null;
  watcher?.observe(stage);
  window.addEventListener('resize', frame);
  modal.onClose(() => actions.preview(null, atMirror));
  state.onChange(render);

  return {
    open(menu, t, opener, mirror = false) {
      fromMenu = menu;
      atMirror = mirror;
      box.classList.toggle('at-mirror', mirror);
      if (t) tab = t;
      selected = null;
      modal.open(opener);
      render();
      frame();
      if (!state.inv) void state.refresh();
    },
    close: () => modal.close(),
    isOpen: () => modal.isOpen(),
    onClose: (cb) => modal.onClose(cb),
    setLook(l) {
      look = { ...l };
      render();
    },
  };
}

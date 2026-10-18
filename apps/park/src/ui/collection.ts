import {
  CATALOGUE,
  RARITY_COLOURS,
  RARITY_NAMES,
  colourwaysFor,
  craftCost,
  equipSlotOf,
  localClock,
  parseVariant,
  variantId,
  variantName,
  type EquipSlot,
  type ItemDef,
  type ItemKind,
  type Wear,
} from '@owl-park/shared';
import type { CollectionState } from '../collect/state';
import { deviceTimeZone } from '../collect/service';
import { itemCanvas } from '../game/itemArt';
import { symbolCanvas, type SymbolName } from '../game/symbols';

export interface CollectionActions {
  /** Wear a variant in its slot, or take the slot off (null). */
  equip(slot: EquipSlot, variant: string | null): void;
  emote(emote: string): void;
  toast(message: string, ms?: number, accent?: string): void;
  /** What the owl wears right now. */
  wear(): Wear | undefined;
}

const TABS: Array<{ kind: ItemKind; label: string }> = [
  { kind: 'wear', label: 'Wear' },
  { kind: 'pet', label: 'Pets' },
  { kind: 'fx', label: 'Effects' },
  { kind: 'emote', label: 'Emotes' },
];

const FX_SYMBOL: Record<string, SymbolName> = {
  aura: 'dot',
  sparkle: 'star4',
  'eye-flames': 'flame',
  'ember-trail': 'flame',
  'frost-breath': 'puff',
  snowfall: 'flake',
  fireflies: 'dot',
  hearts: 'heart',
  'music-notes': 'note',
  'star-halo': 'star5',
  'moon-halo': 'crescent',
  'leaf-swirl': 'leaf',
  'petal-swirl': 'petal',
  bubbles: 'bubble',
  'smoke-wisps': 'puff',
  'rainbow-trail': 'star4',
  lightning: 'bolt',
  'neon-outline': 'ring',
  'shadow-aura': 'puff',
  sunbeam: 'spark',
  confetti: 'square',
  'comet-tail': 'star4',
  'rune-ring': 'diamond',
  glitch: 'square',
};
const EMOTE_SYMBOL: Record<string, SymbolName> = {
  hoot: 'ring',
  flap: 'leaf',
  heart: 'heart',
  dance: 'note',
  sleep: 'bubble',
  surprise: 'bang',
  shiver: 'flake',
  sneeze: 'puff',
  stomp: 'puff',
  twirl: 'star4',
  flip: 'star5',
  wink: 'star4',
};

const CSS = `
#hud .collection{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(max(12px,env(safe-area-inset-bottom)) + 62px);width:min(560px,calc(100vw - 20px));max-height:min(72vh,640px);display:none;flex-direction:column;gap:10px;pointer-events:auto;background:rgba(12,30,54,.95);border:1px solid rgba(246,241,227,.18);border-radius:18px;padding:14px;box-shadow:0 10px 40px rgba(0,0,0,.55)}
#hud .collection.open{display:flex}
#hud .collection header{display:flex;align-items:center;gap:10px}
#hud .collection h2{margin:0;font-size:16px}
#hud .collection [data-progress]{font-size:13px;opacity:.85;flex:1}
#hud .collection .x{min-height:36px;padding:6px 12px}
#hud .collection nav{display:flex;gap:6px;flex-wrap:wrap}
#hud .collection nav button{min-height:36px;padding:6px 14px;background:rgba(246,241,227,.08);color:#F6F1E3;border:1px solid rgba(246,241,227,.18);box-shadow:none}
#hud .collection nav button[aria-selected=true]{background:#C9A227;color:#0C1E36}
#hud .collection .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;overflow:auto;padding:2px;min-height:120px}
#hud .card{background:rgba(246,241,227,.06);border:1px solid rgba(246,241,227,.12);border-radius:12px;padding:6px;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;pointer-events:auto}
#hud .card.sel{border-color:#F6F1E3}
#hud .card.worn{box-shadow:0 0 0 2px #C9A227 inset}
#hud .card canvas{width:64px;height:48px}
#hud .card.none canvas{opacity:.28;filter:grayscale(1)}
#hud .card .nm{font-size:11px;text-align:center;line-height:1.2;min-height:26px}
#hud .dots{display:flex;flex-wrap:wrap;gap:3px;justify-content:center}
#hud .dots i{width:9px;height:9px;border-radius:50%;border:1.5px solid currentColor;display:block;opacity:.75}
#hud .dots i.own{background:currentColor;opacity:1}
#hud .dots i.cur{outline:2px solid #F6F1E3;outline-offset:1px}
#hud .detail{display:flex;align-items:center;gap:10px;min-height:44px;flex-wrap:wrap}
#hud .detail .what{flex:1;min-width:160px;font-size:13px}
#hud .detail .what b{display:block;font-size:14px}
#hud .collection footer{font-size:12px;opacity:.8;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#hud .collection footer button{min-height:30px;padding:4px 10px;font-size:12px}
#hud .emotes{position:absolute;left:0;bottom:calc(100% + 8px);pointer-events:auto;background:rgba(12,30,54,.94);border:1px solid rgba(246,241,227,.18);border-radius:16px;padding:10px;display:none;flex-wrap:wrap;gap:6px;width:min(330px,calc(100vw - 24px));box-shadow:0 8px 30px rgba(0,0,0,.5)}
#hud .emotes.open{display:flex}
#hud .emotes button{min-height:40px;padding:6px 10px;font-size:13px;background:rgba(246,241,227,.08);color:#F6F1E3;border:1px solid rgba(246,241,227,.18);box-shadow:none;display:flex;align-items:center;gap:6px}
#hud .emotes canvas{width:18px;height:18px}
`;

/** An icon for any variant, drawn on a canvas (async for item art). */
export function variantIcon(variant: string, w = 64, h = 48): HTMLCanvasElement {
  const dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  const v = parseVariant(variant);
  if (!ctx || !v) return canvas;
  const symbol = (name: SymbolName, tint: string, glow: boolean) => {
    const s = Math.min(canvas.width, canvas.height) * 0.8;
    if (glow) {
      const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, s * 0.6);
      g.addColorStop(0, `${tint}cc`);
      g.addColorStop(1, `${tint}00`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    // Tint the white symbol: draw it, then colour it in with source-atop.
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = Math.round(s);
    const t = tmp.getContext('2d');
    if (!t) return;
    t.drawImage(symbolCanvas(name), 0, 0, tmp.width, tmp.height);
    t.globalCompositeOperation = 'source-atop';
    t.fillStyle = tint;
    t.fillRect(0, 0, tmp.width, tmp.height);
    ctx.drawImage(tmp, (canvas.width - s) / 2, (canvas.height - s) / 2);
  };
  if (v.item.kind === 'fx') symbol(FX_SYMBOL[v.item.id] ?? 'star4', v.colour?.tint ?? '#C9A227', true);
  else if (v.item.kind === 'emote') symbol(EMOTE_SYMBOL[v.item.id] ?? 'star4', '#4FA3FF', false);
  else {
    void itemCanvas(variant, dpr).then((art) => {
      const k = Math.min(canvas.width / art.width, canvas.height / art.height);
      const dw = art.width * k;
      const dh = art.height * k;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(art, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    });
  }
  return canvas;
}

/** The dot colour hinting at a colourway (effects show their tint; art shows a hue). */
function dotColour(item: ItemDef, n: number): string {
  const c = colourwaysFor(item.kind)[n];
  if (!c) return '#F6F1E3';
  if (c.tint) return c.tint;
  return n === 0 ? '#F6F1E3' : `hsl(${(45 + (c.hue ?? 0)) % 360} 70% 62%)`;
}

export interface CollectionPanel {
  open(tab?: ItemKind): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  /** Rebuild the emote tray from what is owned. */
  renderEmotes(): void;
}

export function createCollectionPanel(root: HTMLElement, emoteHost: HTMLElement, state: CollectionState, actions: CollectionActions): CollectionPanel {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const panel = document.createElement('section');
  panel.className = 'collection';
  panel.setAttribute('aria-label', 'Collection');
  panel.innerHTML = `
    <header><h2>Collection</h2><span data-progress></span><button class="ghost x" data-close aria-label="Close collection">Close</button></header>
    <nav role="tablist" data-tabs></nav>
    <div class="grid" data-grid role="list"></div>
    <div class="detail" data-detail></div>
    <footer data-tz></footer>`;
  root.appendChild(panel);

  const emotes = document.createElement('div');
  emotes.className = 'emotes';
  emotes.setAttribute('aria-label', 'Emotes');
  emoteHost.appendChild(emotes);

  const $ = <T extends Element>(sel: string) => panel.querySelector(sel) as T;
  const progress = $<HTMLElement>('[data-progress]');
  const tabsEl = $<HTMLElement>('[data-tabs]');
  const grid = $<HTMLElement>('[data-grid]');
  const detail = $<HTMLElement>('[data-detail]');
  const tzLine = $<HTMLElement>('[data-tz]');

  let tab: ItemKind = 'wear';
  /** The selected colourway per item id. */
  const pick = new Map<string, number>();
  let selected: string | null = null;

  const button = (label: string, cls: string, onClick: () => void, disabled = false) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  };

  const renderTabs = () => {
    tabsEl.innerHTML = '';
    for (const t of TABS) {
      const b = button(t.label, '', () => {
        tab = t.kind;
        selected = null;
        render();
      });
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(t.kind === tab));
      tabsEl.appendChild(b);
    }
  };

  const ownedVariantsOf = (item: ItemDef) => (item.kind === 'emote' ? [item.id] : colourwaysFor(item.kind).map((c) => `${item.id}~${c.n}`)).filter((v) => state.owns(v));

  const renderDetail = () => {
    detail.innerHTML = '';
    if (!selected) {
      const hint = document.createElement('div');
      hint.className = 'what';
      hint.textContent = tab === 'emote' ? 'Pick an emote to play it, or to craft one you have not found yet.' : 'Pick something to wear it, or tap a dot for another colourway.';
      detail.appendChild(hint);
      return;
    }
    const v = parseVariant(selected);
    if (!v) return;
    const what = document.createElement('div');
    what.className = 'what';
    const name = document.createElement('b');
    name.textContent = variantName(selected);
    const rarity = document.createElement('span');
    rarity.textContent = RARITY_NAMES[v.rarity];
    rarity.style.color = RARITY_COLOURS[v.rarity];
    what.append(name, rarity);
    detail.appendChild(what);
    const sel = selected;
    if (state.owns(sel)) {
      if (v.item.kind === 'emote') {
        detail.appendChild(button('Play', '', () => actions.emote(sel)));
      } else {
        const slot = equipSlotOf(v)!;
        const worn = actions.wear()?.[slot] === sel;
        detail.appendChild(button(worn ? 'Take off' : 'Wear', worn ? 'ghost' : '', () => {
          actions.equip(slot, worn ? null : sel);
          render();
        }));
      }
    } else {
      const cost = craftCost(sel) ?? 0;
      const feathers = state.inv?.feathers ?? 0;
      detail.appendChild(
        button(`Craft for ${cost} feathers`, feathers < cost ? 'ghost' : '', async () => {
          const res = await state.craft(sel);
          if (res.ok) actions.toast(`Crafted: ${variantName(sel)}`, 2600, RARITY_COLOURS[v.rarity]);
          else actions.toast(res.reason === 'feathers' ? `You need ${cost} feathers for that (you have ${res.feathers}).` : 'That could not be crafted just now.', 3000);
          render();
        }, feathers < cost),
      );
    }
  };

  const renderGrid = () => {
    grid.innerHTML = '';
    const wear = actions.wear();
    const worn = new Set(Object.values(wear ?? {}));
    for (const item of CATALOGUE.filter((i) => i.kind === tab)) {
      const owned = ownedVariantsOf(item);
      const ways = colourwaysFor(item.kind);
      const firstOwned = owned[0] ? (parseVariant(owned[0])?.colour?.n ?? 0) : 0;
      const n = pick.get(item.id) ?? firstOwned;
      const variant = variantId(item.id, n);
      const card = document.createElement('div');
      card.className = `card${owned.length ? '' : ' none'}${selected === variant ? ' sel' : ''}${owned.some((o) => worn.has(o)) ? ' worn' : ''}`;
      card.setAttribute('role', 'listitem');
      card.dataset['item'] = item.id;
      card.appendChild(variantIcon(variant));
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = item.name;
      card.appendChild(nm);
      card.addEventListener('click', () => {
        selected = variant;
        render();
      });
      if (ways.length) {
        const dots = document.createElement('div');
        dots.className = 'dots';
        for (const c of ways) {
          const id = `${item.id}~${c.n}`;
          const d = document.createElement('i');
          d.className = `${state.owns(id) ? 'own' : ''}${c.n === n ? ' cur' : ''}`;
          d.style.color = dotColour(item, c.n);
          d.title = variantName(id);
          d.addEventListener('click', (ev) => {
            ev.stopPropagation();
            pick.set(item.id, c.n);
            selected = id;
            render();
          });
          dots.appendChild(d);
        }
        card.appendChild(dots);
      }
      grid.appendChild(card);
    }
  };

  const renderTz = () => {
    tzLine.innerHTML = '';
    const inv = state.inv;
    if (!inv) return;
    const label = document.createElement('span');
    label.textContent = `Finds refresh at midnight and noon, ${inv.tz} time · next at ${localClock(inv.next, inv.tz)}`;
    tzLine.appendChild(label);
    const device = deviceTimeZone();
    if (device && device !== inv.tz) {
      if (inv.tzLockedUntil && inv.tzLockedUntil > Date.now()) {
        const until = document.createElement('span');
        until.textContent = `(this device is on ${device}; you can switch after ${new Date(inv.tzLockedUntil).toLocaleDateString()})`;
        tzLine.appendChild(until);
      } else {
        tzLine.appendChild(
          button(`Use ${device}`, 'ghost', async () => {
            const res = await state.setTimeZone(device);
            actions.toast(res.ok ? `Your finds now follow ${res.tz} time.` : 'The time zone can change once a month.', 3200);
            render();
          }),
        );
      }
    }
  };

  const render = () => {
    const inv = state.inv;
    progress.textContent = inv ? `${state.count} of ${state.total} · ${inv.feathers} feathers` : 'Loading…';
    renderTabs();
    renderGrid();
    renderDetail();
    renderTz();
  };

  const renderEmotes = () => {
    emotes.innerHTML = '';
    const owned = CATALOGUE.filter((i) => i.kind === 'emote' && state.owns(i.id));
    for (const item of owned) {
      const b = button('', '', () => {
        actions.emote(item.id);
        emotes.classList.remove('open');
      });
      b.dataset['emote'] = item.id;
      b.append(variantIcon(item.id, 18, 18), document.createTextNode(item.name));
      emotes.appendChild(b);
    }
    if (!owned.length) {
      const empty = document.createElement('span');
      empty.textContent = 'Find emotes around the park.';
      emotes.appendChild(empty);
    }
  };

  $<HTMLButtonElement>('[data-close]').addEventListener('click', () => panel.classList.remove('open'));
  state.onChange(() => {
    if (panel.classList.contains('open')) render();
    renderEmotes();
  });
  renderEmotes();

  return {
    open(t) {
      if (t) tab = t;
      panel.classList.add('open');
      render();
      if (!state.inv) void state.refresh();
    },
    close() {
      panel.classList.remove('open');
    },
    toggle() {
      if (panel.classList.contains('open')) panel.classList.remove('open');
      else this.open();
    },
    isOpen() {
      return panel.classList.contains('open');
    },
    renderEmotes,
  };
}

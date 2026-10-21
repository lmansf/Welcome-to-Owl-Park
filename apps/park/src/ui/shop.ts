import { DUPLICATE_FEATHERS, RARITY_COLOURS, RARITY_NAMES, variantName, type ShopOffer, type ShopView } from '@owl-park/shared';
import type { CollectionState } from '../collect/state';
import { variantIcon } from './itemIcon';
import { timeLeft } from './quests';

export interface ShopPanel {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

const CSS = `
#hud .shop .gift{display:flex;gap:12px;align-items:center;background:linear-gradient(135deg,rgba(255,42,161,.18),rgba(255,211,106,.14));border:1px solid rgba(255,211,106,.45);border-radius:14px;padding:12px}
#hud .shop .gift canvas{width:96px;height:72px;flex:none}
#hud .shop .gift .what{flex:1;display:flex;flex-direction:column;gap:3px;font-size:13px}
#hud .shop .gift .what b{font-size:15px}
#hud .shop .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}
#hud .shop .item{background:rgba(246,241,227,.06);border:1px solid rgba(246,241,227,.12);border-radius:12px;padding:8px 6px;display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center}
#hud .shop .item canvas{width:64px;height:48px}
#hud .shop .item .nm{font-size:12px;line-height:1.2;min-height:28px}
#hud .shop .item .rr{font-size:11px}
#hud .shop .item button,#hud .shop .gift button{min-height:34px;padding:5px 12px;font-size:13px}
#hud .shop .owned{font-size:12px;opacity:.75;min-height:34px;display:flex;align-items:center}
`;

/**
 * Nova's feather shop: today's free gift, today's three, the featured shelf (a curated set in its
 * season, otherwise the week's rarest) and this week's eight. Feathers come from quests, leaf piles
 * and duplicates; the starter pack is never sold.
 */
export function createShopPanel(root: HTMLElement, state: CollectionState, toast: (message: string, ms?: number, accent?: string) => void, onOpen: () => void): ShopPanel {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const panel = document.createElement('section');
  panel.className = 'sheet shop';
  panel.setAttribute('aria-label', 'Feather shop');
  root.appendChild(panel);

  let view: ShopView | null = null;
  let buying: string | null = null;
  let loading = false;
  let claiming = false;

  const feathers = () => state.inv?.feathers ?? view?.feathers ?? 0;
  const owns = (variant: string) => state.owns(variant) || (view?.owned.includes(variant) ?? false);

  const buyButton = (o: ShopOffer): HTMLElement => {
    if (owns(o.variant)) {
      const done = document.createElement('span');
      done.className = 'owned';
      done.textContent = 'In your collection';
      return done;
    }
    const b = document.createElement('button');
    const short = feathers() < o.price;
    b.textContent = buying === o.variant ? 'Buying…' : `${o.price} feathers`;
    b.className = short ? 'ghost' : '';
    b.disabled = short || buying !== null;
    b.dataset['buy'] = o.variant;
    if (short) b.title = `You have ${feathers()} feathers`;
    b.addEventListener('click', () => void buy(o));
    return b;
  };

  const itemCard = (o: ShopOffer): HTMLElement => {
    const card = document.createElement('div');
    card.className = 'item';
    card.dataset['variant'] = o.variant;
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = variantName(o.variant);
    const rr = document.createElement('div');
    rr.className = 'rr';
    rr.textContent = RARITY_NAMES[o.rarity];
    rr.style.color = RARITY_COLOURS[o.rarity];
    card.append(variantIcon(o.variant), nm, rr, buyButton(o));
    return card;
  };

  const section = (title: string, sub: string) => {
    const h = document.createElement('h3');
    h.textContent = sub ? `${title} · ${sub}` : title;
    panel.appendChild(h);
  };

  const render = () => {
    if (!panel.classList.contains('open')) return;
    panel.innerHTML = '';
    const header = document.createElement('header');
    const h2 = document.createElement('h2');
    h2.textContent = 'Feather shop';
    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.textContent = `You have ${feathers()} feathers`;
    sub.dataset['feathers'] = String(feathers());
    const close = document.createElement('button');
    close.className = 'ghost x';
    close.textContent = 'Close';
    close.setAttribute('aria-label', 'Close the shop');
    close.addEventListener('click', () => panel.classList.remove('open'));
    header.append(h2, sub, close);
    panel.appendChild(header);
    if (!view) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = loading ? 'Opening the shop…' : 'The shop could not open just now. Try again in a moment.';
      panel.appendChild(p);
      return;
    }
    const rot = view.rotation;
    const gift = rot.gift;
    if (gift) {
      section("Today's gift", `a new one in ${timeLeft(rot.nextDay)}`);
      const card = document.createElement('div');
      card.className = 'gift';
      card.dataset['variant'] = gift.variant;
      const what = document.createElement('div');
      what.className = 'what';
      const name = document.createElement('b');
      name.textContent = variantName(gift.variant);
      const rr = document.createElement('span');
      rr.textContent = `${RARITY_NAMES[gift.rarity]} · free, one a day`;
      rr.style.color = RARITY_COLOURS[gift.rarity];
      const note = document.createElement('span');
      note.textContent = view.giftTaken ? 'Taken today. Come back tomorrow!' : owns(gift.variant) ? `You have it already: taking it pays ${DUPLICATE_FEATHERS[gift.rarity]} feathers.` : 'Yours to take.';
      what.append(name, rr, note);
      const take = document.createElement('button');
      take.textContent = view.giftTaken ? 'Taken' : claiming ? 'Taking…' : 'Take it';
      take.className = view.giftTaken ? 'ghost' : '';
      take.disabled = view.giftTaken || claiming;
      take.dataset['gift'] = gift.variant;
      take.addEventListener('click', () => void claim());
      card.append(variantIcon(gift.variant, 96, 72), what, take);
      panel.appendChild(card);
    }
    if (rot.daily.length) {
      section("Today's three", `new in ${timeLeft(rot.nextDay)}`);
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const o of rot.daily) grid.appendChild(itemCard(o));
      panel.appendChild(grid);
    }
    if (rot.featured.length) {
      section(rot.featuredTitle, `changes in ${timeLeft(rot.nextFeatured)}`);
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const o of rot.featured) grid.appendChild(itemCard(o));
      panel.appendChild(grid);
    }
    section('This week', `new stock in ${timeLeft(rot.nextWeek)}`);
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const o of rot.weekly) grid.appendChild(itemCard(o));
    panel.appendChild(grid);
  };

  const load = async () => {
    loading = true;
    render();
    try {
      view = await state.shop();
      state.setFeathers(view.feathers);
    } catch {
      view = null;
    } finally {
      loading = false;
      render();
    }
  };

  const buy = async (o: ShopOffer) => {
    if (buying) return;
    buying = o.variant;
    render();
    try {
      const res = await state.buy(o.variant);
      if (res.ok) toast(`Bought: ${variantName(o.variant)}. Find it in your collection.`, 3400, RARITY_COLOURS[o.rarity]);
      else if (res.reason === 'feathers') toast(`That needs ${o.price} feathers (you have ${res.feathers}).`, 3200);
      else if (res.reason === 'owned') toast('You have that one already.', 2600);
      else toast('That is not on the shelf any more. The shop has changed.', 3200);
      if (!res.ok && res.reason === 'not-offered') void load();
    } catch {
      toast('The shop could not take that just now. Try again in a moment.', 3200);
    } finally {
      buying = null;
      render();
    }
  };

  const claim = async () => {
    if (claiming || !view || view.giftTaken) return;
    claiming = true;
    render();
    try {
      const res = await state.claimGift();
      if (res.ok) {
        view = { ...view, giftTaken: true };
        const rarity = view.rotation.gift?.rarity;
        if (res.dup) toast(`You had ${variantName(res.variant)} already: +${res.feathers} feathers.`, 3400);
        else toast(`A gift: ${variantName(res.variant)}! Find it in your collection.`, 3400, rarity ? RARITY_COLOURS[rarity] : undefined);
      } else if (res.reason === 'taken') {
        view = { ...view, giftTaken: true };
        toast('You took today’s gift already. A new one comes tomorrow.', 3200);
      } else {
        toast('There is no gift today.', 2600);
      }
    } catch {
      toast('The gift could not be given just now. Try again in a moment.', 3200);
    } finally {
      claiming = false;
      render();
    }
  };

  state.onChange(() => render());

  return {
    open() {
      onOpen();
      panel.classList.add('open');
      void load();
    },
    close() {
      panel.classList.remove('open');
    },
    isOpen: () => panel.classList.contains('open'),
  };
}

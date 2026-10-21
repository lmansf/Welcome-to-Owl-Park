import { ACCENT_COLOURS, BELLY_COLOURS, BODY_COLOURS, getSpecies, selectableSpecies, type NestSpotId, type NpcDef, type OwlLook, type Vec2 } from '@owl-park/shared';
import type { QuestState } from '../collect/quests';
import type { TaskState } from '../collect/tasks';
import type { CollectionState } from '../collect/state';
import type { ConnectionStatus } from '../net';
import { createActivityCards, type CopyView, type QuizView } from './activities';
import { createCollectionPanel, type CollectionActions, type CollectionPanel } from './collection';
import { createDecorateSheet, type DecorateActions, type DecorateSheet, type DecorateView } from './decorate';
import { createJoystick } from './joystick';
import { createQuestUi, type QuestActions, type QuestUi } from './quests';
import { createBoothPanel, type BoothInfo, type BoothPanel } from './booth';
import { createShopPanel, type ShopPanel } from './shop';
import { createTicketCard, type GateCard } from './tickets';

/** Something to do where the owl stands: one button each, and E runs the first. */
export interface HudAction {
  id: string;
  label: string;
}

/** A chip at the edge of the screen pointing toward something off screen (placed by game/hints.ts). */
export interface HudHint {
  id: string;
  /** Centre in CSS pixels. */
  x: number;
  y: number;
  /** Arrow direction in radians (0 points right). */
  angle: number;
  /** CSS colour of the ring and arrow. */
  tint: string;
  label: string;
}

export interface Hud {
  setCount(n: number): void;
  /** Owls in the whole park, when known (authoritative transports). */
  setParkCount(n: number | null): void;
  setStatus(s: ConnectionStatus, kind: 'local' | 'supabase' | 'edge'): void;
  /** A short message; `accent` colours its edge (rarity colours for rewards). */
  toast(message: string, ms?: number, accent?: string): void;
  /** Wire the collection panel, the emote tray, the feather count and the shop to the visitor's collection. */
  attachCollection(state: CollectionState, actions: CollectionActions): CollectionPanel;
  /** Wire the quest tracker, the journal and NPC dialogues to the visitor's quests and today's tasks. */
  attachQuests(state: QuestState, actions: QuestActions, tasks: TaskState): void;
  /** Talking to an NPC owl: its quests, and the shop for the shopkeeper. */
  openDialogue(npc: NpcDef): void;
  closeDialogue(): void;
  /** The NPC whose dialogue is open, if any. */
  dialogueNpc(): string | null;
  /** J: open or close the quest journal (closing the other panels). */
  toggleJournal(): void;
  /** The feather shop. */
  openShop(): void;
  /** The lobby's ticket booth. */
  openBooth(info: BoothInfo): void;
  /** The ticket card that flips up as the turnstiles take a ticket. */
  showTicket(card: GateCard): void;
  /** The room the owl is in (the lobby shows its welcome instead of the quest hints). */
  setRoom(roomId: string): void;
  /** The action buttons for where the owl stands (gift shop, Realm Vote, ...); empty hides them. */
  setActions(actions: HudAction[]): void;
  onAction(cb: (id: string) => void): void;
  /** Q: open or close the collection (closing the other panels). */
  toggleCollection(): void;
  /** Escape: close every open panel. */
  closePanels(): void;
  /** The off-screen hint chips; an empty list clears them. */
  setHints(hints: HudHint[]): void;
  onHint(cb: (id: string) => void): void;
  setLook(look: OwlLook): void;
  onLookChange(cb: (look: OwlLook) => void): void;
  /** The stage quiz's card while the owl is by the stage; null hides it. */
  setQuiz(view: QuizView | null): void;
  /** The robot owl's copy game while it runs; null hides it. */
  setCopy(view: CopyView | null): void;
  /** A note button of the copy game (an emote), or null for its Stop button. */
  onCopy(cb: (note: string | null) => void): void;
  /** Where the thumbstick points (touch screens), one of eight ways like the walking keys; null while it rests. */
  stickDirection(): Vec2 | null;
  /** The Decorate sheet for the owner's own nest, starting at `spot`; it hides the bottom bar while open. */
  openDecorate(view: DecorateView, spot: NestSpotId, actions: DecorateActions): void;
  /** The nest changed while the sheet is open. */
  updateDecorate(view: DecorateView): void;
  /** The room picked a spot. */
  selectDecorateSpot(spot: NestSpotId): void;
  closeDecorate(): void;
}

const CSS = `
#hud{position:fixed;inset:0;pointer-events:none;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#F6F1E3;
  padding:max(10px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));}
#hud *{box-sizing:border-box}
#hud .bar{display:flex;justify-content:space-between;align-items:center;gap:8px}
#hud .brand{font-weight:700;letter-spacing:.04em;font-size:18px;text-shadow:0 1px 2px rgba(0,0,0,.6);display:flex;align-items:center;gap:8px}
#hud .brand i{width:22px;height:22px;border-radius:50%;background:#C9A227;display:inline-block;position:relative}
#hud .brand i:before,#hud .brand i:after{content:"";position:absolute;top:6px;width:7px;height:7px;border-radius:50%;background:#F6F1E3;box-shadow:inset 0 0 0 2px #0C1E36}
#hud .brand i:before{left:3px}#hud .brand i:after{right:3px}
#hud .pill,#hud .feathers{pointer-events:auto;background:rgba(12,30,54,.72);border:1px solid rgba(246,241,227,.18);border-radius:999px;padding:8px 14px;font-size:14px;backdrop-filter:blur(6px);display:flex;align-items:center;gap:8px;white-space:nowrap}
#hud .dot{width:8px;height:8px;border-radius:50%;background:#C9A227;box-shadow:0 0 8px #C9A227}
#hud .dot.offline{background:#999;box-shadow:none}
#hud .dot.connecting{background:#F6F1E3;opacity:.6}
#hud .bottom{position:absolute;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));display:flex;justify-content:space-between;align-items:flex-end;gap:8px}
#hud button{pointer-events:auto;cursor:pointer;font:inherit;color:#0C1E36;background:#C9A227;border:0;border-radius:999px;padding:10px 16px;font-weight:700;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.35);min-height:44px}
#hud button.ghost{background:rgba(12,30,54,.72);color:#F6F1E3;border:1px solid rgba(246,241,227,.18)}
#hud .owl{position:relative}
#hud .panel{position:absolute;left:0;bottom:calc(100% + 8px);pointer-events:auto;background:rgba(12,30,54,.92);border:1px solid rgba(246,241,227,.18);border-radius:16px;padding:14px;width:min(320px,calc(100vw - 24px));display:none;flex-direction:column;gap:10px;box-shadow:0 8px 30px rgba(0,0,0,.5)}
#hud .panel.open{display:flex}
#hud .panel h2{margin:0;font-size:15px;font-weight:700}
#hud .row{display:flex;flex-direction:column;gap:6px}
#hud .row span{font-size:12px;opacity:.8}
#hud .swatches{display:flex;gap:8px;flex-wrap:wrap}
#hud .sw{width:34px;height:34px;border-radius:50%;border:2px solid transparent;cursor:pointer;pointer-events:auto;padding:0;min-height:0;box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)}
#hud .sw.on{border-color:#F6F1E3;transform:scale(1.08)}
#hud .toasts{position:absolute;z-index:10;left:50%;transform:translateX(-50%);bottom:calc(max(12px,env(safe-area-inset-bottom)) + 64px);display:flex;flex-direction:column;gap:6px;align-items:center;width:min(92vw,520px)}
#hud .toast{background:rgba(246,241,227,.95);color:#0C1E36;border-radius:12px;padding:10px 14px;font-size:14px;font-weight:600;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.4);animation:hud-in .25s ease-out}
@keyframes hud-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
#hud .actions button{animation:hud-in .25s ease-out}
#hud kbd{display:none;margin-left:8px;padding:0 6px;border:1px solid currentColor;border-radius:5px;font:700 11px/1.5 system-ui,sans-serif;opacity:.7;vertical-align:1px}
@media (hover:hover) and (pointer:fine){#hud kbd{display:inline-block}}
#hud .actions{display:flex;gap:8px;align-items:flex-end}
#hud .left{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}
#hud .feathers{display:none;font-size:14px;font-weight:700}
#hud .feathers.show{display:flex}
#hud .feathers svg{width:18px;height:18px;filter:drop-shadow(0 0 4px rgba(255,211,106,.7))}
#hud .species{display:flex;gap:6px;flex-wrap:wrap}
#hud .species button{min-height:34px;padding:5px 11px;font-size:13px;background:rgba(246,241,227,.08);color:#F6F1E3;border:1px solid rgba(246,241,227,.18);box-shadow:none}
#hud .species button[aria-pressed=true]{background:#C9A227;color:#0C1E36}
#hud .panel .natural{min-height:34px;padding:5px 12px;font-size:13px;align-self:flex-start}
#hud .toast.accent{border-left:6px solid var(--accent)}
#hud .emote-wrap{position:relative}
#hud .hints{position:absolute;inset:0;pointer-events:none}
#hud .hint{position:absolute;width:44px;height:44px;min-height:0;margin:-22px 0 0 -22px;padding:0;border-radius:50%;background:rgba(12,30,54,.8);border:2px solid var(--tint);box-shadow:0 0 12px var(--tint);display:flex;align-items:center;justify-content:center;animation:hud-in .25s ease-out}
#hud .hint i{display:block;width:0;height:0;border-left:14px solid var(--tint);border-top:9px solid transparent;border-bottom:9px solid transparent;transform-origin:50% 50%}
@media (max-width:520px){#hud .bar{flex-wrap:wrap}#hud .feathers{order:3}}
`;

export function createHud(parent: HTMLElement, initialLook: OwlLook): Hud {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'hud';
  root.innerHTML = `
    <div class="bar">
      <div class="brand" aria-label="Owl Park"><i aria-hidden="true"></i>Owl Park</div>
      <div class="feathers" role="status" aria-label="Feathers" data-feathers><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 28C6 16 15 6 28 3C27 15 18 24 7 27Z" fill="#FFD36A"/><path d="M4 30Q15 18 28 3" stroke="#0C1E36" stroke-width="1.6" fill="none"/></svg><span data-feathers-text>0</span></div>
      <div class="pill" role="status" aria-live="polite"><span class="dot connecting" data-dot></span><span data-count>1 owl here</span></div>
    </div>
    <div class="hints" data-hints></div>
    <div class="toasts" aria-live="polite" data-toasts></div>
    <div class="bottom">
      <div class="left">
        <div class="owl">
          <div class="panel" data-panel aria-label="Your owl">
            <h2>Your owl</h2>
            <div class="row"><span>Kind of owl</span><div class="species" data-species></div></div>
            <div class="row"><span>Feathers</span><div class="swatches" data-sw="body"></div></div>
            <div class="row"><span>Belly</span><div class="swatches" data-sw="belly"></div></div>
            <div class="row"><span>Tufts and feet</span><div class="swatches" data-sw="accent"></div></div>
            <button class="ghost natural" data-natural>Natural colours</button>
          </div>
          <button class="ghost" data-customize aria-expanded="false">Your owl</button>
        </div>
        <button class="ghost" data-collection-btn aria-expanded="false" aria-keyshortcuts="Q">Collection<kbd aria-hidden="true">Q</kbd></button>
        <button class="ghost" data-quests-btn aria-expanded="false" aria-keyshortcuts="J">Quests<kbd aria-hidden="true">J</kbd></button>
        <div class="emote-wrap" data-emote-wrap><button class="ghost" data-emotes-btn aria-expanded="false">Emotes</button></div>
      </div>
      <div class="actions" data-actions></div>
    </div>`;
  parent.appendChild(root);

  const $ = <T extends Element>(sel: string) => root.querySelector(sel) as T;
  const dot = $<HTMLElement>('[data-dot]');
  const count = $<HTMLElement>('[data-count]');
  const toasts = $<HTMLElement>('[data-toasts]');
  const panel = $<HTMLElement>('[data-panel]');
  const customize = $<HTMLButtonElement>('[data-customize]');
  const actionsEl = $<HTMLElement>('[data-actions]');
  const hintsEl = $<HTMLElement>('[data-hints]');
  const hintEls = new Map<string, HTMLButtonElement>();
  let hintCb: ((id: string) => void) | null = null;
  const feathersPill = $<HTMLElement>('[data-feathers]');
  const feathersText = $<HTMLElement>('[data-feathers-text]');
  const collectionBtn = $<HTMLButtonElement>('[data-collection-btn]');
  const questsBtn = $<HTMLButtonElement>('[data-quests-btn]');
  const bar = $<HTMLElement>('.bar');
  const cards = createActivityCards(root, bar);
  const stick = createJoystick($<HTMLElement>('.bottom'));
  let questUi: QuestUi | null = null;
  let shop: ShopPanel | null = null;
  let booth: BoothPanel | null = null;
  let ticketCard: ReturnType<typeof createTicketCard> | null = null;
  let roomId = '';
  const emotesBtn = $<HTMLButtonElement>('[data-emotes-btn]');
  const emoteWrap = $<HTMLElement>('[data-emote-wrap]');
  let collectionPanel: CollectionPanel | null = null;
  let decorate: DecorateSheet | null = null;
  /** The room scene that opened the Decorate sheet answers it (the sheet outlives a scene). */
  let decorateActions: DecorateActions | null = null;
  const decorateVia: DecorateActions = {
    place: (spot, item) => decorateActions?.place(spot, item) ?? Promise.resolve(),
    setOpen: (open) => decorateActions?.setOpen(open) ?? Promise.resolve(),
    claimGift: () => decorateActions?.claimGift() ?? Promise.resolve(),
    select: (spot) => decorateActions?.select(spot),
    done: () => decorateActions?.done(),
    thumb: (art) => decorateActions?.thumb(art) ?? null,
    resize: (px) => {
      // Messages show above the sheet while it is open.
      root.style.setProperty('--sheet-h', `${Math.round(px)}px`);
      decorateActions?.resize(px);
    },
  };

  let look: OwlLook = { ...initialLook };
  let lookCb: ((l: OwlLook) => void) | null = null;
  let actionCb: ((id: string) => void) | null = null;
  let shownActions = '';
  let here = 1;
  let park: number | null = null;
  const renderCount = () => {
    const base = here === 1 ? '1 owl here' : `${here} owls here`;
    count.textContent = park !== null && park > here ? `${base} · ${park} in the park` : base;
  };

  const groups: Array<[keyof OwlLook, string[]]> = [
    ['body', BODY_COLOURS],
    ['belly', BELLY_COLOURS],
    ['accent', ACCENT_COLOURS],
  ];
  const renderSwatches = () => {
    for (const [part, colours] of groups) {
      const host = $<HTMLElement>(`[data-sw="${part}"]`);
      host.innerHTML = '';
      for (const c of colours) {
        const b = document.createElement('button');
        b.className = `sw${look[part] === c ? ' on' : ''}`;
        b.style.background = c;
        b.setAttribute('aria-label', `${part} colour ${c}`);
        b.dataset['part'] = part;
        b.dataset['colour'] = c;
        b.addEventListener('click', () => {
          look = { ...look, [part]: c };
          renderSwatches();
          lookCb?.(look);
        });
        host.appendChild(b);
      }
    }
  };
  renderSwatches();

  const speciesHost = $<HTMLElement>('[data-species]');
  const renderSpecies = () => {
    speciesHost.innerHTML = '';
    const current = getSpecies(look.species).id;
    for (const sp of selectableSpecies()) {
      const b = document.createElement('button');
      b.textContent = sp.name.replace(/ owl$/, '');
      b.dataset['species'] = sp.id;
      b.setAttribute('aria-pressed', String(sp.id === current));
      b.setAttribute('aria-label', sp.name);
      b.addEventListener('click', () => {
        look = { ...look, species: sp.id };
        renderSpecies();
        lookCb?.(look);
      });
      speciesHost.appendChild(b);
    }
  };
  renderSpecies();
  $<HTMLButtonElement>('[data-natural]').addEventListener('click', () => {
    look = { ...look, ...getSpecies(look.species).natural };
    renderSwatches();
    lookCb?.(look);
  });

  const closeEmotes = () => {
    emoteWrap.querySelector('.emotes')?.classList.remove('open');
    emotesBtn.setAttribute('aria-expanded', 'false');
  };
  /** The big sheets (collection, journal, dialogue, shop) share the middle of the screen: one at a time. */
  const closeSheets = (keep?: 'collection' | 'journal') => {
    if (keep !== 'collection') {
      collectionPanel?.close();
      collectionBtn.setAttribute('aria-expanded', 'false');
    }
    if (keep !== 'journal') questUi?.closeJournal();
    questsBtn.setAttribute('aria-expanded', String(keep === 'journal'));
    questUi?.closeDialogue();
    shop?.close();
    booth?.close();
    // Decorating ends with the sheet: the room puts its camera back.
    if (decorate?.isOpen()) decorateActions?.done();
  };
  const closeOwlPanel = () => {
    panel.classList.remove('open');
    customize.setAttribute('aria-expanded', 'false');
  };
  customize.addEventListener('click', () => {
    const open = !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    customize.setAttribute('aria-expanded', String(open));
    if (open) {
      closeSheets();
      closeEmotes();
    }
  });
  const toggleCollection = () => {
    if (!collectionPanel) return;
    closeSheets('collection');
    collectionPanel.toggle();
    collectionBtn.setAttribute('aria-expanded', String(collectionPanel.isOpen()));
    closeOwlPanel();
    closeEmotes();
  };
  collectionBtn.addEventListener('click', toggleCollection);
  const toggleJournal = () => {
    if (!questUi) return;
    closeSheets('journal');
    questUi.toggleJournal();
    questsBtn.setAttribute('aria-expanded', String(questUi.isJournalOpen()));
    closeOwlPanel();
    closeEmotes();
  };
  questsBtn.addEventListener('click', toggleJournal);
  emotesBtn.addEventListener('click', () => {
    const tray = emoteWrap.querySelector('.emotes');
    if (!tray) return;
    const open = !tray.classList.contains('open');
    tray.classList.toggle('open', open);
    emotesBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      closeSheets();
      closeOwlPanel();
    }
  });
  /** Before a sheet opens on its own (a dialogue, the shop): close the rest. */
  const makeRoom = () => {
    closeSheets();
    closeOwlPanel();
    closeEmotes();
  };

  return {
    setCount(n) {
      here = n;
      renderCount();
    },
    setParkCount(n) {
      park = n;
      renderCount();
    },
    setStatus(s, kind) {
      dot.className = `dot ${s === 'online' ? '' : s}`.trim();
      dot.title = s === 'online' ? (kind === 'local' ? 'Connected (this device only)' : 'Connected') : s === 'connecting' ? 'Connecting…' : 'Offline';
      dot.dataset['status'] = s;
    },
    toast(message, ms = 2600, accent) {
      const el = document.createElement('div');
      el.className = accent ? 'toast accent' : 'toast';
      if (accent) el.style.setProperty('--accent', accent);
      el.textContent = message;
      toasts.appendChild(el);
      setTimeout(() => el.remove(), ms);
    },
    attachCollection(state, actions) {
      collectionPanel = createCollectionPanel(root, emoteWrap, state, actions);
      shop = createShopPanel(root, state, actions.toast, makeRoom);
      const showFeathers = () => {
        feathersPill.classList.toggle('show', state.inv !== null);
        feathersText.textContent = String(state.inv?.feathers ?? 0);
        feathersPill.setAttribute('aria-label', `${state.inv?.feathers ?? 0} feathers`);
      };
      state.onChange(showFeathers);
      showFeathers();
      return collectionPanel;
    },
    attachQuests(state, actions, tasks) {
      questUi = createQuestUi(root, bar, state, actions, makeRoom, tasks);
      if (roomId) questUi.setRoom(roomId);
    },
    openDialogue(npc) {
      questUi?.openDialogue(npc);
    },
    closeDialogue() {
      questUi?.closeDialogue();
    },
    dialogueNpc: () => questUi?.dialogueNpc() ?? null,
    toggleJournal,
    openShop() {
      shop?.open();
    },
    openBooth(info) {
      booth ??= createBoothPanel(root, makeRoom);
      booth.open(info);
    },
    showTicket(card) {
      ticketCard ??= createTicketCard(root);
      ticketCard.show(card);
    },
    setRoom(id) {
      roomId = id;
      questUi?.setRoom(id);
    },
    setActions(list) {
      const key = list.map((a) => `${a.id}:${a.label}`).join('|');
      if (key === shownActions) return;
      shownActions = key;
      actionsEl.innerHTML = '';
      list.forEach((a, i) => {
        const b = document.createElement('button');
        b.dataset['action'] = a.id;
        b.textContent = a.label;
        if (i === 0) {
          // E runs the first action; the key cap shows only where there is a keyboard.
          b.setAttribute('aria-keyshortcuts', 'E');
          const k = document.createElement('kbd');
          k.setAttribute('aria-hidden', 'true');
          k.textContent = 'E';
          b.appendChild(k);
        }
        b.addEventListener('click', () => actionCb?.(a.id));
        actionsEl.appendChild(b);
      });
    },
    onAction(cb) {
      actionCb = cb;
    },
    toggleCollection,
    setHints(list) {
      const seen = new Set<string>();
      for (const h of list) {
        seen.add(h.id);
        let b = hintEls.get(h.id);
        if (!b) {
          b = document.createElement('button');
          b.className = 'hint';
          b.dataset['hint'] = h.id;
          b.appendChild(document.createElement('i'));
          const id = h.id;
          b.addEventListener('click', () => hintCb?.(id));
          hintsEl.appendChild(b);
          hintEls.set(h.id, b);
        }
        b.style.left = `${h.x.toFixed(1)}px`;
        b.style.top = `${h.y.toFixed(1)}px`;
        b.style.setProperty('--tint', h.tint);
        b.setAttribute('aria-label', h.label);
        (b.firstChild as HTMLElement).style.transform = `rotate(${h.angle.toFixed(3)}rad)`;
      }
      for (const [id, b] of hintEls) {
        if (seen.has(id)) continue;
        b.remove();
        hintEls.delete(id);
      }
    },
    onHint(cb) {
      hintCb = cb;
    },
    closePanels() {
      closeOwlPanel();
      closeSheets();
      closeEmotes();
    },
    setLook(l) {
      look = { ...l };
      renderSwatches();
      renderSpecies();
    },
    onLookChange(cb) {
      lookCb = cb;
    },
    setQuiz: (v) => cards.setQuiz(v),
    setCopy: (v) => cards.setCopy(v),
    onCopy: (cb) => cards.onCopy(cb),
    stickDirection: () => stick.direction(),
    openDecorate(view, spot, actions) {
      decorateActions = actions;
      decorate ??= createDecorateSheet(
        root,
        decorateVia,
        () => {
          makeRoom();
          root.classList.add('decorating');
        },
        () => root.classList.remove('decorating'),
      );
      decorate.open(view, spot);
    },
    updateDecorate: (view) => decorate?.update(view),
    selectDecorateSpot: (spot) => decorate?.select(spot),
    closeDecorate: () => decorate?.close(),
  };
}

import { MAX_ACTIVE_QUESTS, WAY_OUT_WORDS, type EquipSlot, type FeedbackDraft, type NestSpotId, type NpcDef, type OwlLook, type Vec2, type Wear } from '@owl-park/shared';
import type { QuestState } from '../collect/quests';
import type { TaskState } from '../collect/tasks';
import type { CollectionState } from '../collect/state';
import type { ConnectionStatus } from '../net';
import type { FeedbackOutcome } from '../net/feedback';
import type { SettingsStore } from '../settings';
import { createActivityCards, type CopyView, type QuizView } from './activities';
import { createDecorateSheet, type DecorateActions, type DecorateSheet, type DecorateView } from './decorate';
import { createEmoteWheel, wheelEmotes, type EmoteWheel } from './emoteWheel';
import { createFeedbackScreen, type FeedbackScreen } from './feedback';
import { HOME_WORDS } from './home';
import { createJoystick } from './joystick';
import { createLeaveCard } from './leaveCard';
import { createMenu, type MenuScreenId } from './menu';
import { createOwlBuilder, type OwlBuilder, type PreviewFrame } from './owlBuilder';
import { createQuestUi, type QuestActions, type QuestUi } from './quests';
import { createSayWheel } from './sayWheel';
import { createSettingsScreen } from './settingsScreen';
import { createBoothPanel, type BoothInfo, type BoothPanel } from './booth';
import { createShopPanel, type ShopPanel } from './shop';
import { createFreePassCard, createTicketCard, type FreePassCard, type FreePassOffer, type GateCard } from './tickets';

/** What the HUD asks of the park for the visitor's collection: wearing things, emotes, messages. */
export interface CollectionActions {
  /** Wear a variant in its slot, or take the slot off (null). */
  equip(slot: EquipSlot, variant: string | null): void;
  emote(emote: string): void;
  toast(message: string, ms?: number, accent?: string): void;
  /** What the owl wears right now. */
  wear(): Wear | undefined;
  /** The owl's look right now (its kind, colours and what it wears). */
  look(): OwlLook;
}

/** The Menu's ways out (C43), as the room scene carries them out. */
export interface WayOutActions {
  /** "Leave the park": to the lobby, outside the gate (the card asked first). */
  leave(): void;
  /** "Go home": straight to the owl's own nest. */
  home(): void;
  /** "Home screen" (OP-065): out of the room as through a door, to the home screen. */
  title(): void;
}

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
  /** Wire the emote wheel, the owl builder, the feather count and the shop to the visitor's collection. */
  attachCollection(state: CollectionState, actions: CollectionActions): void;
  /** Feedback in the Menu; each note goes with the room the owl is in and the screen's size. */
  attachFeedback(send: (draft: FeedbackDraft) => Promise<FeedbackOutcome>): void;
  /** The Menu's ways out: what "Leave the park" and "Go home" do. */
  attachWayOut(actions: WayOutActions): void;
  /** Which ways out the Menu offers where the owl is: leaving inside the park, going home outside its own nest. */
  setWaysOut(ways: { leave: boolean; home: boolean }): void;
  /** Wire the quest tracker, the journal and NPC dialogues to the visitor's quests and today's tasks. */
  attachQuests(state: QuestState, actions: QuestActions, tasks: TaskState): void;
  /** Talking to an NPC owl: its quests, and the shop for the shopkeeper. */
  openDialogue(npc: NpcDef): void;
  closeDialogue(): void;
  /** The NPC whose dialogue is open, if any. */
  dialogueNpc(): string | null;
  /** M: open or close the Menu (closing the other screens). */
  toggleMenu(): void;
  /** The Emotes button: open or close the emote wheel. */
  toggleEmotes(): void;
  /** T: open or close the Say wheel. */
  toggleSay(): void;
  /** The Say wheel says a phrase through this (false: it was not said). */
  onSay(cb: (n: number) => boolean): void;
  /**
   * 1 to 8: play that emote of the wheel (its page, while it is open), unless another screen is open;
   * while the Say wheel is open, 1 to 4 say a phrase of its group.
   */
  emoteKey(n: number): void;
  /** Q: open or close the owl builder. */
  toggleOwl(): void;
  /** J: open or close the quests screen. */
  toggleJournal(): void;
  /** A screen that takes the keys and the taps is open (the Menu or one of its screens): the owl stays put. */
  isBlocking(): boolean;
  /** Where the owl builder shows the owl, while it is open (CSS pixels); null when it closes. */
  onOwlPreview(cb: (frame: PreviewFrame | null) => void): void;
  /** The home screen is up (OP-065): the park's bar, buttons, cards and thumbstick are not shown. */
  setHome(on: boolean): void;
  /** The home screen's buttons: the owl builder and Settings, without the way back to the Menu. */
  openOwl(opener: HTMLElement): void;
  openSettings(opener: HTMLElement): void;
  /** The feather shop. */
  openShop(): void;
  /** The lobby's ticket booth. */
  openBooth(info: BoothInfo): void;
  /** The ticket card that flips up as the turnstiles take a ticket. */
  showTicket(card: GateCard): void;
  /** Opening night (C42): after the ticket card, the half-price pass to claim. */
  offerFreePass(offer: FreePassOffer): void;
  /** Look for a pass the owl went to claim, and say when it has come. */
  watchFreePass(claimed: () => Promise<boolean>): void;
  /** The room the owl is in (the lobby shows its welcome instead of the quest hints). */
  setRoom(roomId: string): void;
  /** The action buttons for where the owl stands (gift shop, Realm Vote, ...); empty hides them. */
  setActions(actions: HudAction[]): void;
  onAction(cb: (id: string) => void): void;
  /** The pad's Interact button (touch screens): what E does, the first action where the owl stands. */
  onInteract(cb: () => void): void;
  /** The pad's Jump button (touch screens): a hop. */
  onJump(cb: () => void): void;
  /**
   * Quest news (OP-083): a new quest taken on, or one ready to hand in. A short line at the top of
   * the screen, and a dot on the Menu button and its Quests tile until the quests screen is opened.
   */
  questNews(kind: 'new' | 'done', title: string): void;
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
#hud .menu-btn{position:relative;display:flex;align-items:center;gap:10px;min-height:52px;padding:10px 20px 10px 16px;font-size:16px;border-radius:999px;background:rgba(12,30,54,.86);color:#F6F1E3;border:1px solid rgba(255,211,106,.55);box-shadow:0 4px 14px rgba(0,0,0,.45)}
#hud .menu-btn i{position:relative;width:20px;height:14px;border-top:3px solid #FFD36A;border-bottom:3px solid #FFD36A}
#hud .menu-btn i::after{content:"";position:absolute;left:0;right:0;top:50%;margin-top:-1.5px;height:3px;background:#FFD36A}
#hud .menu-btn[aria-expanded=true]{background:#C9A227;color:#0C1E36}
#hud .menu-btn[aria-expanded=true] i,#hud .menu-btn[aria-expanded=true] i::after{border-color:#0C1E36;background:#0C1E36}
#hud .menu-btn[aria-expanded=true] i{background:transparent}
#hud .emote-btn{position:relative;display:flex;align-items:center;justify-content:center;width:52px;min-height:52px;height:52px;padding:0;border-radius:50%;background:rgba(12,30,54,.86);border:1px solid rgba(255,211,106,.55);box-shadow:0 4px 14px rgba(0,0,0,.45)}
#hud .emote-btn svg{width:34px;height:34px}
#hud .emote-btn[aria-expanded=true]{background:#C9A227}
#hud .emote-btn kbd{position:absolute;top:-6px;right:-8px;margin:0;color:#F6F1E3;background:rgba(12,30,54,.92)}
#hud .badge{position:absolute;top:-3px;right:-3px;width:13px;height:13px;border-radius:50%;background:#FF6B81;box-shadow:0 0 0 2px #0C1E36,0 0 8px rgba(255,107,129,.8)}
#hud .badge[hidden]{display:none}
#hud .pad{display:none}
#hud.covered .bar,#hud.covered .welcome,#hud.covered .welcome.show,#hud.covered .bottom,#hud.covered .hints,#hud.covered .cards,#hud.covered .notices{visibility:hidden}
#hud.no-stick .stick{display:none}
#hud.at-home .bar,#hud.at-home .welcome,#hud.at-home .welcome.show,#hud.at-home .bottom,#hud.at-home .hints,#hud.at-home .cards,#hud.at-home .notices{display:none}
@media (pointer:coarse){#hud.no-stick .bottom .actions{bottom:0}}
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
#hud .toast.accent{border-left:6px solid var(--accent)}
#hud .notices{position:absolute;z-index:10;left:50%;transform:translateX(-50%);top:calc(max(10px,env(safe-area-inset-top)) + 54px);display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none}
#hud .notice{background:rgba(12,30,54,.92);color:#FFD36A;border:1px solid rgba(255,211,106,.55);border-radius:999px;padding:7px 16px;font-size:14px;font-weight:700;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.4);animation:hud-in .25s ease-out}
/*
 * Touch screens: a pad like a handheld's (OP-082). The thumbstick stays in the bottom-right corner;
 * on the left, Interact (nearer the middle) and Jump (nearer the corner) on a diagonal, the Menu
 * button as a smaller, darker button tucked in the corner, and Emotes above them. All see-through,
 * like the stick; each at least 44 px, none overlapping another.
 */
@media (pointer:coarse){
  #hud .bottom .left{position:absolute;left:0;bottom:0;display:block;width:172px;height:174px;max-width:none}
  #hud .pad{display:block;position:absolute;left:0;bottom:0;width:172px;height:174px}
  #hud .pad-btn{position:absolute;min-height:0;padding:0;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#F6F1E3;background:rgba(12,30,54,.28);border:2px solid rgba(246,241,227,.32);box-shadow:inset 0 0 18px rgba(0,0,0,.25);touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
  #hud .pad-btn svg{width:32px;height:32px}
  #hud .pad-btn.interact{left:104px;bottom:96px;width:68px;height:68px;border-color:rgba(255,211,106,.7);box-shadow:inset 0 0 18px rgba(0,0,0,.25),0 0 12px rgba(255,211,106,.35)}
  #hud .pad-btn.interact.idle{opacity:.55;border-color:rgba(246,241,227,.32);box-shadow:inset 0 0 18px rgba(0,0,0,.25)}
  #hud .pad-btn.jump{left:36px;bottom:54px;width:60px;height:60px}
  #hud .pad-btn.on{background:rgba(12,30,54,.4);border-color:rgba(255,211,106,.6)}
  #hud .menu-btn{position:absolute;left:0;bottom:0;width:46px;height:46px;min-height:46px;padding:0;gap:0;justify-content:center;font-size:0;background:rgba(4,10,20,.5);border:2px solid rgba(246,241,227,.26);box-shadow:inset 0 0 14px rgba(0,0,0,.3)}
  #hud .menu-btn i{width:18px;height:13px}
  #hud .emote-btn{position:absolute;left:10px;bottom:126px;width:48px;height:48px;min-height:48px;background:rgba(12,30,54,.28);border:2px solid rgba(246,241,227,.32);box-shadow:inset 0 0 18px rgba(0,0,0,.25)}
  #hud .emote-btn svg{width:30px;height:30px}
  #hud .toasts{bottom:calc(max(12px,env(safe-area-inset-bottom)) + 186px)}
}
#hud .hints{position:absolute;inset:0;pointer-events:none}
#hud .hint{position:absolute;width:44px;height:44px;min-height:0;margin:-22px 0 0 -22px;padding:0;border-radius:50%;background:rgba(12,30,54,.8);border:2px solid var(--tint);box-shadow:0 0 12px var(--tint);display:flex;align-items:center;justify-content:center;animation:hud-in .25s ease-out}
#hud .hint i{display:block;width:0;height:0;border-left:14px solid var(--tint);border-top:9px solid transparent;border-bottom:9px solid transparent;transform-origin:50% 50%}
@media (max-width:520px){#hud .bar{flex-wrap:wrap}#hud .feathers{order:3}}
`;

/** The Emotes button's face: a smile in a dotted ring, like the wheel it opens. */
const EMOTES_ICON =
  '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="17" fill="none" stroke="#FFD36A" stroke-width="3" stroke-dasharray="8 5.4"/><circle cx="24" cy="24" r="9" fill="#FFD36A"/><path d="M20 25.5q4 3.4 8 0" stroke="#0C1E36" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="21" cy="21.6" r="1.5" fill="#0C1E36"/><circle cx="27" cy="21.6" r="1.5" fill="#0C1E36"/></svg>';

/** The pad's Interact button: an open hand. */
const INTERACT_ICON =
  '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M11 15.5V7.5a1.8 1.8 0 0 1 3.6 0V14m0-.5V5.8a1.8 1.8 0 0 1 3.6 0V14m0-.5V7.2a1.8 1.8 0 0 1 3.6 0v9.3c0 5.5-3.4 9.5-8.3 9.5-3.3 0-5.3-1.6-7-4.3l-3-5a1.8 1.8 0 0 1 3-2l2.5 3.3" fill="none" stroke="#F6F1E3" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** The pad's Jump button: up from a little arc. */
const JUMP_ICON =
  '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 26c3.2-10 18.8-10 22 0" fill="none" stroke="#F6F1E3" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="3 3.4"/><path d="M16 21V7m-5.5 5.5L16 7l5.5 5.5" fill="none" stroke="#FFD36A" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** The Menu, its screens, and the emote wheel (which has a button of its own). */
type ScreenId = MenuScreenId | 'menu' | 'emotes';

export function createHud(parent: HTMLElement, initialLook: OwlLook, settings: SettingsStore): Hud {
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
    <div class="notices" aria-live="polite" data-notices></div>
    <div class="toasts" aria-live="polite" data-toasts></div>
    <div class="bottom">
      <div class="pad">
        <button class="pad-btn interact idle" data-pad-interact aria-label="Interact" aria-disabled="true">${INTERACT_ICON}</button>
        <button class="pad-btn jump" data-pad-jump aria-label="Jump">${JUMP_ICON}</button>
      </div>
      <div class="left">
        <button class="menu-btn" data-menu-btn aria-haspopup="dialog" aria-expanded="false" aria-keyshortcuts="M"><i aria-hidden="true"></i>Menu<kbd aria-hidden="true">M</kbd><span class="badge" data-quest-dot hidden></span></button>
        <button class="emote-btn" data-emotes-btn aria-label="Emotes" aria-haspopup="dialog" aria-expanded="false">${EMOTES_ICON}</button>
      </div>
      <div class="actions" data-actions></div>
    </div>`;
  parent.appendChild(root);

  const $ = <T extends Element>(sel: string) => root.querySelector(sel) as T;
  const dot = $<HTMLElement>('[data-dot]');
  const count = $<HTMLElement>('[data-count]');
  const toasts = $<HTMLElement>('[data-toasts]');
  const menuBtn = $<HTMLButtonElement>('[data-menu-btn]');
  const emotesBtn = $<HTMLButtonElement>('[data-emotes-btn]');
  const interactBtn = $<HTMLButtonElement>('[data-pad-interact]');
  const jumpBtn = $<HTMLButtonElement>('[data-pad-jump]');
  const questDot = $<HTMLElement>('[data-quest-dot]');
  const notices = $<HTMLElement>('[data-notices]');
  const actionsEl = $<HTMLElement>('[data-actions]');
  const hintsEl = $<HTMLElement>('[data-hints]');
  const hintEls = new Map<string, HTMLButtonElement>();
  let hintCb: ((id: string) => void) | null = null;
  const feathersPill = $<HTMLElement>('[data-feathers]');
  const feathersText = $<HTMLElement>('[data-feathers-text]');
  const bar = $<HTMLElement>('.bar');
  const cards = createActivityCards(root, bar);
  const stick = createJoystick($<HTMLElement>('.bottom'));
  let questUi: QuestUi | null = null;
  let questState: QuestState | null = null;
  let taskState: TaskState | null = null;
  let collectionState: CollectionState | null = null;
  let shop: ShopPanel | null = null;
  let booth: BoothPanel | null = null;
  let ticketCard: ReturnType<typeof createTicketCard> | null = null;
  let freePass: FreePassCard | null = null;
  let roomId = '';
  let wheel: EmoteWheel | null = null;
  let feedback: FeedbackScreen | null = null;
  let builder: OwlBuilder | null = null;
  let collectionActions: CollectionActions | null = null;
  let wayOut: WayOutActions | null = null;
  let waysOut = { leave: false, home: false };
  let previewCb: ((frame: PreviewFrame | null) => void) | null = null;
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
  let interactCb: (() => void) | null = null;
  let jumpCb: (() => void) | null = null;
  /** Quest news not seen yet: the dot on the Menu button and its Quests tile. */
  let questNews = false;
  let shownActions = '';
  let here = 1;
  let park: number | null = null;
  const renderCount = () => {
    const base = here === 1 ? '1 owl here' : `${here} owls here`;
    count.textContent = park !== null && park > here ? `${base} · ${park} in the park` : base;
  };

  // Settings: what the screen shows.
  const applySettings = () => {
    root.classList.toggle('no-stick', !settings.get().thumbstick);
  };
  settings.onChange(applySettings);
  applySettings();

  // ---- the Menu and its screens: one open at a time ----
  let sayCb: ((n: number) => boolean) | null = null;
  const sayWheel = createSayWheel(root, (n) => sayCb?.(n) ?? false);
  const menu = createMenu(
    root,
    [
      { id: 'say', title: 'Say', key: 'T', sub: () => '' },
      {
        id: 'owl',
        title: 'Your owl',
        key: 'Q',
        sub: () => (collectionState?.inv ? `Kind, colours, wear, pets · ${collectionState.count} of ${collectionState.total} collected` : 'Kind, colours, wear, pets, effects'),
      },
      {
        id: 'quests',
        title: 'Quests',
        key: 'J',
        badge: () => questNews,
        sub: () => {
          const board = questState?.board;
          const today = taskState?.view;
          const parts = [board ? `${board.active.length} of ${MAX_ACTIVE_QUESTS} under way` : 'Quests and today’s tasks'];
          if (today && taskState) parts.push(`today ${taskState.done} of ${today.tasks.length}`);
          return parts.join(' · ');
        },
      },
      { id: 'settings', title: 'Settings', key: '', sub: () => 'Quest cards, thumbstick, calm motion, controls' },
      { id: 'feedback', title: 'Feedback', key: '', sub: () => 'Found a bug? Have an idea? Tell the keepers.', highlight: true },
      { id: 'home', title: WAY_OUT_WORDS.home, key: '', sub: () => '', shown: () => waysOut.home },
      { id: 'leave', title: WAY_OUT_WORDS.leave, key: '', sub: () => '', shown: () => waysOut.leave },
      { id: 'title', title: HOME_WORDS.menu, key: '', sub: () => '' },
    ],
    (id) => openScreen(id, true),
  );
  const leaveCard = createLeaveCard(root, () => wayOut?.leave());
  const settingsScreen = createSettingsScreen(root, settings, () => openScreen('menu'));
  menu.onClose(() => menuBtn.setAttribute('aria-expanded', 'false'));

  /** The big sheets (dialogue, shop, booth, Decorate) share the bottom of the screen: one at a time. */
  const closeSheets = () => {
    questUi?.closeDialogue();
    shop?.close();
    booth?.close();
    // Decorating ends with the sheet: the room puts its camera back.
    if (decorate?.isOpen()) decorateActions?.done();
  };
  /** Close the Menu and every screen it opens. */
  const closeScreens = () => {
    menu.close();
    wheel?.close();
    sayWheel.close();
    builder?.close();
    questUi?.closeJournal();
    settingsScreen.close();
    feedback?.close();
    leaveCard.close();
  };
  const isBlocking = () => menu.isOpen() || !!wheel?.isOpen() || sayWheel.isOpen() || !!builder?.isOpen() || !!questUi?.isJournalOpen() || settingsScreen.isOpen() || !!feedback?.isOpen() || leaveCard.isOpen();
  /** Before a sheet or a screen opens on its own (a dialogue, the shop): close the rest. */
  const makeRoom = () => {
    closeSheets();
    closeScreens();
  };

  /** `opener` takes the focus back when the screen closes (the Menu button, or a home screen button). */
  function openScreen(id: ScreenId, fromMenu = false, opener: HTMLElement = menuBtn) {
    makeRoom();
    if (id === 'menu') {
      menu.open(menuBtn);
      menuBtn.setAttribute('aria-expanded', 'true');
    } else if (id === 'emotes' && wheel) {
      wheel.open(emotesBtn);
      emotesBtn.setAttribute('aria-expanded', 'true');
    } else if (id === 'say') {
      sayWheel.open(menuBtn);
    } else if (id === 'owl' && builder) {
      builder.setLook(collectionActions?.look() ?? look);
      // The builder covers the whole screen: the bar, the cards and the buttons hide under it.
      root.classList.add('covered');
      builder.open(fromMenu, undefined, opener);
    } else if (id === 'quests') {
      setQuestNews(false);
      questUi?.openJournal(fromMenu, opener);
    }
    else if (id === 'settings') settingsScreen.open(fromMenu, opener);
    else if (id === 'feedback') feedback?.open(fromMenu, opener);
    else if (id === 'leave') leaveCard.open(opener);
    // Going home asks nothing: the owl's nest is a tap away from anywhere, and the park a tap back.
    else if (id === 'home') wayOut?.home();
    // Nor does the home screen: Play is a tap back into the lobby.
    else if (id === 'title') wayOut?.title();
  }
  const toggle = (id: ScreenId, isOpen: () => boolean) => {
    if (isOpen()) closeScreens();
    else openScreen(id);
  };
  menuBtn.addEventListener('click', () => toggle('menu', () => menu.isOpen()));
  emotesBtn.addEventListener('click', () => toggle('emotes', () => !!wheel?.isOpen()));
  interactBtn.addEventListener('click', () => interactCb?.());
  jumpBtn.addEventListener('click', () => jumpCb?.());
  // A pressed look while the thumb is down (touch screens do not all show :active).
  for (const b of [interactBtn, jumpBtn]) {
    b.addEventListener('pointerdown', () => b.classList.add('on'));
    for (const t of ['pointerup', 'pointercancel', 'pointerleave'] as const) b.addEventListener(t, () => b.classList.remove('on'));
  }

  function setQuestNews(on: boolean) {
    questNews = on;
    questDot.hidden = !on;
    menu.refresh();
  }

  /** A short line at the top of the screen that goes by itself (quest news). */
  const notice = (message: string, ms = 2000) => {
    const el = document.createElement('div');
    el.className = 'notice';
    el.textContent = message;
    notices.appendChild(el);
    setTimeout(() => el.remove(), ms);
  };

  const toast = (message: string, ms = 2600, accent?: string) => {
    const el = document.createElement('div');
    el.className = accent ? 'toast accent' : 'toast';
    if (accent) el.style.setProperty('--accent', accent);
    el.textContent = message;
    toasts.appendChild(el);
    setTimeout(() => el.remove(), ms);
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
    toast,
    attachCollection(state, actions) {
      collectionState = state;
      collectionActions = actions;
      wheel = createEmoteWheel(root, state, (e) => actions.emote(e));
      wheel.onClose(() => emotesBtn.setAttribute('aria-expanded', 'false'));
      builder = createOwlBuilder(
        root,
        state,
        {
          equip: (slot, variant) => actions.equip(slot, variant),
          wear: () => actions.wear(),
          changeLook: (l) => {
            look = { ...l };
            lookCb?.(look);
          },
          preview: (frame) => previewCb?.(frame),
        },
        look,
        () => openScreen('menu'),
      );
      builder.onClose(() => root.classList.remove('covered'));
      shop = createShopPanel(root, state, actions.toast, makeRoom);
      state.onChange(() => menu.refresh());
      const showFeathers = () => {
        feathersPill.classList.toggle('show', state.inv !== null);
        feathersText.textContent = String(state.inv?.feathers ?? 0);
        feathersPill.setAttribute('aria-label', `${state.inv?.feathers ?? 0} feathers`);
      };
      state.onChange(showFeathers);
      showFeathers();
    },
    attachFeedback(send) {
      feedback = createFeedbackScreen(
        root,
        (kind, text) => send({ kind, text, room: roomId || null, screen: `${window.innerWidth}x${window.innerHeight}` }),
        toast,
        () => openScreen('menu'),
      );
    },
    attachWayOut(actions) {
      wayOut = actions;
    },
    setWaysOut(ways) {
      waysOut = { ...ways };
      menu.refresh();
    },
    attachQuests(state, actions, tasks) {
      questState = state;
      taskState = tasks;
      questUi = createQuestUi(root, bar, state, actions, makeRoom, tasks, () => openScreen('menu'));
      if (roomId) questUi.setRoom(roomId);
      state.onChange(() => menu.refresh());
      tasks.onChange(() => menu.refresh());
    },
    openDialogue(npc) {
      questUi?.openDialogue(npc);
    },
    closeDialogue() {
      questUi?.closeDialogue();
    },
    dialogueNpc: () => questUi?.dialogueNpc() ?? null,
    toggleMenu: () => toggle('menu', () => menu.isOpen()),
    toggleEmotes: () => toggle('emotes', () => !!wheel?.isOpen()),
    toggleSay: () => toggle('say', () => sayWheel.isOpen()),
    onSay(cb) {
      sayCb = cb;
    },
    emoteKey(n) {
      if (sayWheel.isOpen()) sayWheel.press(n);
      else if (wheel?.isOpen()) wheel.press(n);
      else if (!isBlocking() && collectionState && collectionActions) {
        const emote = wheelEmotes(collectionState)[n - 1];
        if (emote) collectionActions.emote(emote.id);
      }
    },
    toggleOwl: () => toggle('owl', () => !!builder?.isOpen()),
    toggleJournal: () => toggle('quests', () => !!questUi?.isJournalOpen()),
    // TODO-DOCS (OP-082, OP-083): built. docs/ACTIVITIES.md and docs/QUESTS.md still describe the
    // quest tracker and call these PLANNED. The phone pad: the stick on the right; Interact and Jump
    // on a diagonal on the left, the Menu small in the corner and Emotes above; the space bar hops
    // on a computer. Quests: no pop-ups during play; a new or finished quest shows a 2 s line at the
    // top and a dot on the Menu button and its Quests tile until Quests opens; Quests shows each
    // quest's progress (2/5), finished ones first, and Collect walks the owl to the quest's giver to
    // hand it in (the owner's call of 2026-10-23, as is keeping the New quest line for now). The
    // tracker and the daily tasks' progress toast are gone.
    questNews(kind, title) {
      notice(kind === 'new' ? `New quest: ${title}` : `Quest complete: ${title}`);
      if (!questUi?.isJournalOpen()) setQuestNews(true);
    },
    isBlocking,
    onOwlPreview(cb) {
      previewCb = cb;
    },
    setHome(on) {
      root.classList.toggle('at-home', on);
    },
    openOwl: (opener) => openScreen('owl', false, opener),
    openSettings: (opener) => openScreen('settings', false, opener),
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
    offerFreePass(offer) {
      freePass ??= createFreePassCard(root, (m) => toast(m, 5000));
      freePass.show(offer);
    },
    watchFreePass(claimed) {
      freePass ??= createFreePassCard(root, (m) => toast(m, 5000));
      freePass.watch(claimed);
    },
    setRoom(id) {
      roomId = id;
      questUi?.setRoom(id);
    },
    setActions(list) {
      const key = list.map((a) => `${a.id}:${a.label}`).join('|');
      if (key === shownActions) return;
      shownActions = key;
      // The pad's Interact button does the first of them (as E does), and says which.
      interactBtn.classList.toggle('idle', list.length === 0);
      interactBtn.setAttribute('aria-disabled', String(list.length === 0));
      interactBtn.setAttribute('aria-label', list[0] ? `Interact: ${list[0].label}` : 'Interact');
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
    onInteract(cb) {
      interactCb = cb;
    },
    onJump(cb) {
      jumpCb = cb;
    },
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
      closeSheets();
      closeScreens();
    },
    setLook(l) {
      look = { ...l };
      builder?.setLook(look);
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

import { NEST_WORDS, type ArcadeGame, type ClimbInput, type EquipSlot, type FeedbackDraft, type FeedbackRewardView, type LockView, type NestSpotId, type NpcDef, type OwlAccount, type OwlLook, type TravelRefusal, type TravelState, type Vec2, type Wear } from '@owl-park/shared';
import type { QuestState } from '../collect/quests';
import type { TaskState } from '../collect/tasks';
import type { CollectionState } from '../collect/state';
import type { AccountLink, ConnectionStatus } from '../net';
import type { FeedbackSent } from '../net/feedback';
import type { WalletEntry } from '../net/transport';
import type { SettingsStore } from '../settings';
import { createInfoScreens, type InfoKind } from './about';
import { accountCard, createAccountScreens, type AccountScreenDeps, type AccountScreens } from './account';
import { createActivityCards, type CopyView, type QuizView } from './activities';
import { createArcadeScreen, type ArcadeHandlers, type ArcadeResultView, type ArcadeView } from './arcadeScreen';
import { createClimbScreen, type ClimbBandView, type ClimbHandlers, type ClimbResultView, type ClimbView } from './climbScreen';
import { createDecorateSheet, type DecorateActions, type DecorateSheet, type DecorateView } from './decorate';
import { createEmoteWheel, wheelEmotes, type EmoteWheel } from './emoteWheel';
import { createFeedbackScreen, type FeedbackScreen } from './feedback';
import { createFeedbackBug, feedbackIcon } from './feedbackBug';
import { afterReward, createFeedbackCard, type FeedbackCard } from './feedbackReward';
import { coveredBy, type CoveredEdges } from '../game/hudInset';
import { walkingMap } from '../game/walkingMap';
import { createTreeMinimap } from './treeMinimap';
import { createJoystick } from './joystick';
import { eventTime } from './keyboard';
import { createLeaveCard } from './leaveCard';
import { createMenuShell } from './menuShell';
import { mapPlaceOf, newlyLit, renderCollection, renderMap, renderNest, renderSettings, type MapTravel } from './menuTabs';
import { createOwlBuilder, type OwlBuilder, type PreviewFrame } from './owlBuilder';
import { createQuestUi, type QuestActions, type QuestUi } from './quests';
import { createSayWheel } from './sayWheel';
import { createSettingsScreen } from './settingsScreen';
import { createWhichOwlScreen, type WhichOwlRun } from './whichOwl';
import { createShopPanel, type ShopPanel } from './shop';
import { GATE_WORDS, createFreePassCard, createTicketCard, type FreePassCard, type FreePassOffer, type GateCard, type TicketCard } from './tickets';
import { createGateSale, withBring, type GateSale, type GateSalePanel } from './gateSale';
import { createStoreCard, type StoreGo } from './storeCard';
import { createGatePrompt, type GateAsk } from './gatePrompt';
import { SPECTATOR_WORDS, createSpectatorBadge } from './spectator';
import { createTurnPhone } from './turnPhone';

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
  /** Travel from the map (OP-130), its button held: null when the owl is on its way, otherwise why not. */
  travel(place: string): TravelRefusal | null;
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
  /** Words shown beside the arrow, toward the middle of the screen ("To the park", OP-105); none on the rest. */
  text?: string;
}

/** The thanks ladder for feedback (OP-272): where the owl stands, and closing the card beside the bug. */
export interface FeedbackRewardLink {
  load(): Promise<FeedbackRewardView | null>;
  close(): Promise<FeedbackRewardView | null>;
}

export interface Hud {
  setCount(n: number): void;
  /** Owls in the whole park, when known (authoritative transports). */
  setParkCount(n: number | null): void;
  setStatus(s: ConnectionStatus, kind: 'local' | 'edge'): void;
  /** A short message; `accent` colours its edge (rarity colours for rewards). */
  toast(message: string, ms?: number, accent?: string): void;
  /** Wire the emote wheel, the owl builder, the feather count and the shop to the visitor's collection. */
  attachCollection(state: CollectionState, actions: CollectionActions): void;
  /** Feedback in the Menu; each note goes with the room the owl is in and the screen's size. */
  attachFeedback(send: (draft: FeedbackDraft) => Promise<FeedbackSent>, rewards?: FeedbackRewardLink): void;
  /** The owl's account (OP-139): its card in the Menu's Nest and Settings tabs, and the screens that protect and bring back an owl. */
  attachAccount(link: AccountLink, deps: Pick<AccountScreenDeps, 'restart' | 'startOver'>): AccountScreens;
  /** The Menu's ways out: what "Leave the park" and travel from the map do. */
  attachWayOut(actions: WayOutActions): void;
  /** The tickets on this device, for the Menu's Settings tab (null: the page has no park server keeping them). */
  attachTickets(load: () => Promise<WalletEntry[] | null>): void;
  /** Which ways out the Menu offers where the owl is: leaving inside the park; `home` away from its own nest. */
  setWaysOut(ways: { leave: boolean; home: boolean }): void;
  /** The map's places walked into and whether the owl is through the front gate (OP-130), as the room scene has them. */
  setTravel(state: TravelState): void;
  /** Wire the quest tracker, the journal and NPC dialogues to the visitor's quests and today's tasks. */
  attachQuests(state: QuestState, actions: QuestActions, tasks: TaskState): void;
  /** Talking to an NPC owl: its quests, and the shop for the shopkeeper. */
  openDialogue(npc: NpcDef): void;
  closeDialogue(): void;
  /** The NPC whose dialogue is open, if any. */
  dialogueNpc(): string | null;
  /** A code lock's pad, when the owl walks up to it (OP-255), and how a try went. */
  openLock(quest: string, lock: LockView): void;
  closeLock(): void;
  lockShowing(): { quest: string; lock: string } | null;
  lockNote(text: string): void;
  /** The Menu button: open or close the Menu (closing the other screens). */
  toggleMenu(): void;
  /** M: open the Menu on its map (OP-130), or close it there. */
  toggleMap(): void;
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
  /** Close the owl builder, or open it (the first run's Make your owl; the mirror opens it with openMirror). */
  toggleOwl(): void;
  /** The owl builder is open. */
  isOwlOpen(): boolean;
  /** Your owl at a nest's mirror (OP-077): the room shows round the owl, which is the preview. */
  openMirror(opener?: HTMLElement | null): void;
  /** J: open or close the Menu on its Quests tab. */
  toggleJournal(): void;
  /** A screen that takes the keys and the taps is open (the Menu or one of its screens): the owl stays put. */
  isBlocking(): boolean;
  /** Where the owl builder shows the owl, while it is open (CSS pixels), and whether at a mirror; null when it closes. */
  onOwlPreview(cb: (frame: PreviewFrame | null, mirror: boolean) => void): void;
  /** The home screen is up (OP-065): the park's bar, buttons, cards and thumbstick are not shown. */
  setHome(on: boolean): void;
  /** The home screen's buttons: the owl builder and Settings, without the way back to the Menu. */
  openOwl(opener: HTMLElement): void;
  openSettings(opener: HTMLElement): void;
  /** About the park or Safety and privacy (about.ts), from the home screen. */
  openInfo(kind: InfoKind, opener: HTMLElement): void;
  /** Which owl are you (OP-076): a new owl's first run (from Make your owl), drawn over everything. */
  openWhichOwl(run: Omit<WhichOwlRun, 'preview'>, opener: HTMLElement): void;
  /** The feather shop. */
  openShop(): void;
  /**
   * A turnstile reached without a ticket that works (OP-180): the card before the store, then
   * checkout for a Day Ticket over the game, and what follows once the ticket has come. With the
   * park's accounts on, the card also offers to bring here an owl with a ticket on another screen (OP-183).
   */
  sellAtGate(sale: GateSale): void;
  /**
   * The turnstiles' question (OP-198): an owl without a ticket that works, with spectators on, is asked
   * to buy a Day Ticket or enter as a guest; neither steps it back out.
   */
  askAtGate(a: GateAsk): void;
  /**
   * The card before the store (OP-153): Continue goes on to the store (`go`), Not now back to where
   * the visitor was. Every way from the park to the store asks through it; `opener` gets the focus back.
   */
  askStore(go: StoreGo, opener?: HTMLElement | null): void;
  /** The ticket card that flips up as the turnstiles take a ticket. */
  showTicket(card: GateCard): void;
  /**
   * Spectators (OP-191): the owl walks the park as one, or not. The "Just looking" badge shows with its
   * Get a Day Ticket button, the Quests tab says the quests are ticket holders', and the feather shop
   * sells a Day Ticket instead.
   */
  setSpectator(on: boolean): void;
  /** What every Get a Day Ticket does (OP-191): the turnstiles' sale, with `line` above the card before the store. */
  onGetTicket(cb: (line: string) => void): void;
  /** A line with a Get a Day Ticket button under it, for a while (OP-191: the turnstiles, a room busy for spectators). */
  offerTicket(line: string, ms?: number): void;
  /** The arcade's game screen over everything while a run is played (again, if it is open); `handlers` take the play. */
  openArcade(view: ArcadeView, handlers: ArcadeHandlers): void;
  /** The run's score and its line of the moment, as it goes. */
  arcadePlaying(score: number, banner: string): void;
  /** The run is over: how it ended and what it paid. */
  arcadeResult(result: ArcadeResultView): void;
  closeArcade(): void;
  /** The climb screen over everything while a climb is played; it owns its stick, button and keys. */
  openClimb(view: ClimbView, handlers: ClimbHandlers): void;
  /** The climb screen's held controls right now (`jumpPressed` once per press). */
  climbInput(): ClimbInput;
  /** The panes of glass left, of the night's. */
  climbPanes(left: number, of: number): void;
  /** The climb's header: the banked band and the feathers from games left today. */
  climbHeader(banked: number, remainingCap: number): void;
  /** A band line reached and answered. */
  climbBand(band: ClimbBandView): void;
  /** The climb's hint line (one verb at a time; empty clears it). */
  climbHint(line: string): void;
  /** The climb is over: at the clouds, or lost to the room. */
  climbResult(result: ClimbResultView): void;
  closeClimb(): void;
  /**
   * The half-price annual pass (C42, OP-062): after the ticket card on opening night, or right after
   * a Day Ticket bought at the turnstiles has come (OP-180).
   */
  offerFreePass(offer: FreePassOffer): void;
  /** The room the owl is in (the lobby shows its welcome instead of the quest hints). */
  setRoom(roomId: string): void;
  /**
   * Whether that room is played sideways (a tree room, OP-156): while it is, a phone held upright sees
   * a card over the game asking to turn it. It stays through a room change, so it does not flicker
   * between two tree rooms; the next room says again, and the home screen never shows it.
   */
  setSideways(on: boolean): void;
  /**
   * The tree's minimap (OP-213, a computer's screen only): the owl in room `room` at `x` (room px),
   * every frame in a room of the tree; null out of it, which hides the map. It hides too while the
   * Menu or another panel is open.
   */
  setTreeSpot(spot: { room: string; x: number } | null): void;
  /** The action buttons for where the owl stands (gift shop, Realm Vote, ...); empty hides them. */
  setActions(actions: HudAction[]): void;
  onAction(cb: (id: string) => void): void;
  /** The pad's Interact button (touch screens): what E does, the first action where the owl stands. */
  onInteract(cb: () => void): void;
  /**
   * The pad's Jump button (touch screens, OP-084): `press` as the thumb goes down, `release` as it
   * lifts (each with when), so a tap jumps, a second tap flaps and a hold glides, as the space bar does.
   */
  onJump(press: (at?: number) => void, release: (at?: number) => void): void;
  /** The pad's Dash button (touch screens, OP-224): above Jump, shown only while the owl holds the dash (in a parkour course); `press` as the thumb goes down. */
  onDash(press: (at?: number) => void): void;
  /** Whether the owl holds the dash: shows or hides the pad's Dash. */
  setDash(on: boolean): void;
  /**
   * Quest news (OP-083): a new quest taken on, or one ready to hand in. A short line at the top of
   * the screen, and a dot on the Menu button and its Quests tile until the quests screen is opened.
   */
  questNews(kind: 'new' | 'done', title: string): void;
  /** Escape: close every open panel. */
  closePanels(): void;
  /** The off-screen hint chips; an empty list clears them. */
  setHints(hints: HudHint[]): void;
  /** The gated realms the keepers have opened (the realms switch): the Menu map draws their arches as doorways. */
  setOpenRealms(open: readonly string[]): void;
  onHint(cb: (id: string) => void): void;
  /**
   * The nest's welcome (OP-105): a card under the top bar the first time this device's owl is in its
   * own nest, saying the park is out of the door. A tap on it closes it, and so does leaving the nest.
   */
  setNestWelcome(shown: boolean): void;
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
  /** How far the HUD's controls (the owl count, the feathers, Menu, Emotes and Say) reach in from the top and bottom of the screen, in CSS px (OP-278). */
  coveredEdges(): CoveredEdges;
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
#hud .say-btn{position:relative;display:flex;align-items:center;justify-content:center;width:52px;min-height:52px;height:52px;padding:0;border-radius:50%;background:rgba(12,30,54,.86);border:1px solid rgba(255,211,106,.55);box-shadow:0 4px 14px rgba(0,0,0,.45)}
#hud .say-btn svg{width:30px;height:30px}
#hud .say-btn[aria-expanded=true]{background:#C9A227}
#hud .say-btn kbd{position:absolute;top:-6px;right:-8px;margin:0;color:#F6F1E3;background:rgba(12,30,54,.92)}
#hud .badge{position:absolute;top:-3px;right:-3px;width:13px;height:13px;border-radius:50%;background:#FF6B81;box-shadow:0 0 0 2px #0C1E36,0 0 8px rgba(255,107,129,.8)}
#hud .badge[hidden]{display:none}
#hud .pad{display:none}
#hud.covered .bar,#hud.covered .welcome,#hud.covered .welcome.show,#hud.covered .nest-welcome,#hud.covered .bottom,#hud.covered .hints,#hud.covered .cards,#hud.covered .notices{visibility:hidden}
#hud.no-stick .stick{display:none}
#hud.just-in .fb-bug,#hud.just-in .fb-card{pointer-events:none}
#hud.at-home .bar,#hud.at-home .welcome,#hud.at-home .welcome.show,#hud.at-home .nest-welcome.show,#hud.at-home .bottom,#hud.at-home .hints,#hud.at-home .cards,#hud.at-home .notices{display:none}
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
 * Touch screens: a pad laid out like a game controller's (OP-082, OP-114; Logan, 2026-11-03, OP-242).
 * The thumbstick keeps the bottom-left corner; the face buttons keep the bottom-right: Jump the big one
 * in the corner, where a controller's main button sits (OP-084: a tap jumps, a tap in the air flaps,
 * held on the way down it glides), Interact up and to its left, and Dash, in a parkour course only,
 * straight above Jump. Jump is 68 px and the others 56 px; each sits 7 px or more clear of the next.
 * The Menu and Say are small (44 px) and up in the top-right corner, away from the thumbs. All
 * see-through, like the stick.
 */
@media (pointer:coarse){
  #hud .bar{min-height:44px;padding-right:100px}
  #hud .bottom .left{position:fixed;left:auto;bottom:auto;top:max(10px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));display:flex;flex-direction:row-reverse;gap:8px;width:auto;height:auto;max-width:none}
  #hud .pad{display:block;position:absolute;right:0;bottom:0;width:158px;height:132px}
  /* No browser gesture starts on the pad (touch-action none): two thumbs at once must never read as a pinch or a pan (OP-242). */
  #hud .pad{touch-action:none}
  #hud .pad-btn{position:absolute;width:56px;height:56px;min-height:0;padding:0;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#F6F1E3;background:rgba(12,30,54,.28);border:2px solid rgba(246,241,227,.32);box-shadow:inset 0 0 18px rgba(0,0,0,.25);touch-action:none;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
  #hud .pad-btn[hidden]{display:none}
  #hud .pad-btn svg{width:30px;height:30px}
  #hud .pad-btn .i1{fill:#F6F1E3;stroke:#F6F1E3}
  #hud .pad-btn .i2{fill:#FFD36A}
  #hud .pad-btn.interact{right:64px;bottom:50px;border-color:rgba(255,211,106,.7);box-shadow:inset 0 0 18px rgba(0,0,0,.25),0 0 12px rgba(255,211,106,.35)}
  #hud .pad-btn.interact.idle{opacity:.55;border-color:rgba(246,241,227,.32);box-shadow:inset 0 0 18px rgba(0,0,0,.25)}
  #hud .pad-btn.jump{right:0;bottom:0;width:68px;height:68px}
  #hud .pad-btn.jump svg{width:36px;height:36px}
  /* Dash (OP-224), in a parkour course only: straight above Jump. */
  #hud .pad-btn.dash{right:6px;bottom:76px}
  #hud .pad-btn.on{background:rgba(12,30,54,.4);border-color:rgba(255,211,106,.6)}
  #hud .menu-btn{position:relative;width:44px;height:44px;min-height:44px;padding:0;gap:0;justify-content:center;font-size:0;background:rgba(4,10,20,.5);border:2px solid rgba(246,241,227,.26);box-shadow:inset 0 0 14px rgba(0,0,0,.3)}
  #hud .menu-btn i{width:18px;height:13px}
  #hud .emote-btn{position:relative;width:44px;height:44px;min-height:44px;background:rgba(12,30,54,.28);border:2px solid rgba(246,241,227,.32);box-shadow:inset 0 0 18px rgba(0,0,0,.25)}
  #hud .emote-btn svg{width:28px;height:28px}
  #hud .say-btn{position:relative;width:44px;height:44px;min-height:44px;background:rgba(4,10,20,.5);border:2px solid rgba(246,241,227,.26);box-shadow:inset 0 0 14px rgba(0,0,0,.3)}
  #hud .say-btn svg{width:24px;height:24px}
  /* The row of further actions keeps above the face buttons, stick or no stick. */
  #hud .bottom .actions,#hud.no-stick .bottom .actions{position:absolute;right:0;bottom:146px;flex-direction:column;align-items:flex-end}
  #hud .toasts{bottom:calc(max(12px,env(safe-area-inset-bottom)) + 186px)}
  /* A game played on the pad (OP-137): its Interact over the arcade screen, lit, the rest of the pad away. */
  #hud.arcade-pad .pad{visibility:visible;z-index:25}
  #hud.arcade-pad .pad-btn.interact,#hud.arcade-pad .pad-btn.interact.idle{opacity:1;pointer-events:auto;border-color:rgba(255,211,106,.7);box-shadow:inset 0 0 18px rgba(0,0,0,.25),0 0 12px rgba(255,211,106,.35)}
  #hud.arcade-pad .pad-btn.jump,#hud.arcade-pad .pad-btn.dash{display:none}
  /* Hoot & Hop and Talon Toss on the pad (OP-137): the stick over the arcade screen, each flick a hop or a pull to aim (even with the stick off for walking). */
  #hud.arcade-stick .stick{display:block;visibility:visible;z-index:25}
  /* The line on how to play keeps clear of the stick (on the left) or the Interact (on the right) the game is played with. */
  #hud.arcade-pad .arcade .a-hint{left:12px;transform:none;max-width:calc(100% - 176px);white-space:normal;text-align:left}
  #hud.arcade-stick .arcade .a-hint{left:auto;right:12px;transform:none;max-width:calc(100% - 176px);white-space:normal;text-align:right}
}
/* The '!' that stands for Interact, before the first action (what E and the pad's Interact do). */
#hud .actions .bang{display:inline-flex;width:18px;height:18px;margin:0 6px 0 -4px;vertical-align:-3px}
#hud .actions .bang .i1{fill:#0C1E36;stroke:#0C1E36}
#hud .actions .bang .i2{fill:#0C1E36}
#hud .hints{position:absolute;inset:0;pointer-events:none}
#hud .hint{position:absolute;width:44px;height:44px;min-height:0;margin:-22px 0 0 -22px;padding:0;border-radius:50%;background:rgba(12,30,54,.8);border:2px solid var(--tint);box-shadow:0 0 12px var(--tint);display:flex;align-items:center;justify-content:center;animation:hud-in .25s ease-out}
#hud .hint i{display:block;width:0;height:0;border-left:14px solid var(--tint);border-top:9px solid transparent;border-bottom:9px solid transparent;transform-origin:50% 50%}
/* A chip with words (the way to the park, OP-105): the arrow where the plain chip's would be, the words toward the middle. */
#hud .hint.say{width:auto;margin:-22px 0 0;padding:0 14px 0 11px;gap:8px;border-radius:22px;justify-content:flex-start}
#hud .hint.say.flip{flex-direction:row-reverse;padding:0 11px 0 14px}
#hud .hint.say i{border-left-width:18px;border-top-width:7px;border-bottom-width:7px}
#hud .hint.say span{color:#F6F1E3;font-size:14px;font-weight:700;white-space:nowrap}
/* The nest's welcome (OP-105) looks as the lobby's card does (.welcome, ui/quests.ts), and closes at a tap. */
#hud .nest-welcome{display:none;position:relative;margin-top:8px;width:min(330px,calc(100vw - 24px));min-height:0;padding:7px 32px 7px 11px;text-align:left;color:#F6F1E3;
  background:rgba(12,30,54,.72);border:1px solid rgba(246,241,227,.18);border-radius:12px;font-size:13px;font-weight:400;line-height:1.3;box-shadow:none;backdrop-filter:blur(6px)}
#hud .nest-welcome.show{display:block}
#hud .nest-welcome b{display:block;font-size:12px;color:#FFD36A;letter-spacing:.02em}
#hud .nest-welcome i{position:absolute;top:6px;right:11px;font-style:normal;font-size:16px;line-height:1;opacity:.7}
@media (max-width:520px){#hud .bar{flex-wrap:wrap}#hud .feathers{order:3}}
#hud .pill .alone{display:none;align-items:center}
#hud .pill .alone svg{width:18px;height:18px}
/*
 * The phone's screen, decluttered (OP-242, Logan, 2026-11-03): in sight are the stick, Jump, the Menu,
 * one Say button (Emotes are a tap away inside it), the feathers and, only where the owl can do
 * something, Interact wearing what it does. The owl count is the Menu's (under its title), and so is
 * Feedback (its own button by Close); the connection line shows for a few seconds as before and then
 * leaves only a small mark in the bar while the owl wanders alone.
 */
@media (pointer:coarse){
  #hud .brand{font-size:16px}
  #hud .feathers{padding:5px 11px;font-size:13px;gap:6px}
  #hud .feathers svg{width:15px;height:15px}
  #hud .bar .pill{display:none}
  #hud.net-off .bar .pill{display:flex;padding:6px 9px;gap:6px}
  #hud.net-off .bar .pill [data-count]{display:none}
  #hud.net-off .bar .pill .alone{display:inline-flex}
  #hud .emote-btn{display:none}
  #hud .pad-btn.interact.idle{opacity:0;pointer-events:none}
  #hud .pad-btn.interact .lbl{display:none}
  #hud .pad-btn.interact.labelled{width:auto;min-width:56px;max-width:min(240px,calc(100vw - 232px));padding:0 14px 0 12px;gap:4px;justify-content:flex-start;border-radius:28px;background:rgba(12,30,54,.78)}
  #hud .pad-btn.interact.labelled svg{flex:none}
  #hud .pad-btn.interact.labelled .lbl{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:13px;font-weight:700;line-height:1.15;text-align:left;color:#F6F1E3}
  /* The first action is Interact's own, so its button in the row would say it twice. */
  #hud .actions button:first-child{display:none}
}
`;

/** The Say button's face: a speech bubble with two lines of words, like the wheel of phrases it opens. */
const SAY_ICON =
  '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M9 11h30a5 5 0 0 1 5 5v13a5 5 0 0 1-5 5H22l-8 7v-7H9a5 5 0 0 1-5-5V16a5 5 0 0 1 5-5z" fill="#F6F1E3"/><path d="M12 19h22M12 25h15" stroke="#0C1E36" stroke-width="2.6" stroke-linecap="round" opacity=".75"/></svg>';

/** The Emotes button's face: a smile in a dotted ring, like the wheel it opens. */
const EMOTES_ICON =
  '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="17" fill="none" stroke="#FFD36A" stroke-width="3" stroke-dasharray="8 5.4"/><circle cx="24" cy="24" r="9" fill="#FFD36A"/><path d="M20 25.5q4 3.4 8 0" stroke="#0C1E36" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="21" cy="21.6" r="1.5" fill="#0C1E36"/><circle cx="27" cy="21.6" r="1.5" fill="#0C1E36"/></svg>';

/**
 * Interact: an exclamation mark, since the visitor is an owl and has no hands (OP-114). Two tones in
 * the weight of the Menu's icons (OP-108): the stroke in the main tone, the dot in the accent. The
 * same mark stands for Interact on the first action's button and over a character the owl can talk to.
 */
const INTERACT_ICON =
  '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="i1" d="M16 5.5v13.5" stroke-width="4.6" stroke-linecap="round" fill="none"/><circle class="i2" cx="16" cy="25.6" r="2.9"/></svg>';

/** The bar's mark while the owl wanders alone (OP-242): a cloud crossed out. */
const ALONE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 7 18z" fill="none" stroke="#F6F1E3" stroke-width="1.8" stroke-linejoin="round" opacity=".8"/><path d="M4 4l16 16" stroke="#FF6B81" stroke-width="2.2" stroke-linecap="round"/></svg>';

/** A keyboard's click on the pad's Jump is a tap this long: a jump, not a glide. */
const KEY_TAP_MS = 150;
/** How long after the home screen a press on the feedback bug or its card is still taken as one meant for Play. */
const JUST_IN_MS = 2000;

/** How long a place newly lit on the map sparkles, however often the map is drawn again meanwhile (OP-130). */
const SPARKLE_MS = 4000;

/** The pad's Jump button: up from a little arc. */
const DASH_ICON =
  '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 11h9M2 16h11M4 21h9" fill="none" stroke="#F6F1E3" stroke-width="2.4" stroke-linecap="round"/><path d="M15 9l11 7-11 7z" fill="#FFD36A" stroke="#FFD36A" stroke-width="1.6" stroke-linejoin="round"/></svg>';

const JUMP_ICON =
  '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 26c3.2-10 18.8-10 22 0" fill="none" stroke="#F6F1E3" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="3 3.4"/><path d="M16 21V7m-5.5 5.5L16 7l5.5 5.5" fill="none" stroke="#FFD36A" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** The Menu (on its Quests tab, for `quests`), the screens it leads to, and the wheels with buttons of their own. */
type ScreenId = 'menu' | 'quests' | 'map' | 'emotes' | 'say' | 'owl' | 'settings' | 'feedback' | 'leave' | 'title';

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
      <div class="pill" role="status" aria-live="polite"><span class="dot connecting" data-dot></span><span data-count>1 owl here</span><span class="alone" data-alone title="Wandering alone: the park could not connect">${ALONE_ICON}</span></div>
    </div>
    <button class="nest-welcome" data-nest-welcome><b></b><span></span><i aria-hidden="true">×</i></button>
    <div class="hints" data-hints></div>
    <div class="notices" aria-live="polite" data-notices></div>
    <div class="toasts" aria-live="polite" data-toasts></div>
    <div class="bottom" data-park-keys>
      <div class="pad">
        <button class="pad-btn interact idle" data-pad-interact aria-label="Interact" aria-disabled="true">${INTERACT_ICON}<span class="lbl" data-pad-interact-label aria-hidden="true"></span></button>
        <button class="pad-btn jump" data-pad-jump aria-label="Jump" aria-keyshortcuts="Space">${JUMP_ICON}</button>
        <button class="pad-btn dash" data-pad-dash aria-label="Dash" aria-keyshortcuts="Shift" hidden>${DASH_ICON}</button>
      </div>
      <div class="left">
        <button class="menu-btn" data-menu-btn aria-haspopup="dialog" aria-expanded="false" aria-keyshortcuts="M"><i aria-hidden="true"></i>Menu<kbd aria-hidden="true">M</kbd><span class="badge" data-quest-dot hidden></span></button>
        <button class="emote-btn" data-emotes-btn aria-label="Emotes" aria-haspopup="dialog" aria-expanded="false">${EMOTES_ICON}</button>
        <button class="say-btn" data-say-btn aria-label="Say" aria-haspopup="dialog" aria-expanded="false" aria-keyshortcuts="T">${SAY_ICON}<kbd aria-hidden="true">T</kbd></button>
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
  const sayBtn = $<HTMLButtonElement>('[data-say-btn]');
  const interactBtn = $<HTMLButtonElement>('[data-pad-interact]');
  const interactLabel = $<HTMLElement>('[data-pad-interact-label]');
  const jumpBtn = $<HTMLButtonElement>('[data-pad-jump]');
  const dashBtn = $<HTMLButtonElement>('[data-pad-dash]');
  const questDot = $<HTMLElement>('[data-quest-dot]');
  const notices = $<HTMLElement>('[data-notices]');
  const actionsEl = $<HTMLElement>('[data-actions]');
  const hintsEl = $<HTMLElement>('[data-hints]');
  const hintEls = new Map<string, HTMLButtonElement>();
  let hintCb: ((id: string) => void) | null = null;
  const nestWelcome = $<HTMLButtonElement>('[data-nest-welcome]');
  nestWelcome.querySelector('b')!.textContent = NEST_WORDS.welcome;
  nestWelcome.querySelector('span')!.textContent = NEST_WORDS.welcomeLine;
  nestWelcome.addEventListener('click', () => nestWelcome.classList.remove('show'));
  const feathersPill = $<HTMLElement>('[data-feathers]');
  const feathersText = $<HTMLElement>('[data-feathers-text]');
  const bar = $<HTMLElement>('.bar');
  const cards = createActivityCards(root, bar);
  const stick = createJoystick($<HTMLElement>('.bottom'));
  const treeMap = createTreeMinimap(root);
  let questUi: QuestUi | null = null;
  let questState: QuestState | null = null;
  let taskState: TaskState | null = null;
  let collectionState: CollectionState | null = null;
  let shop: ShopPanel | null = null;
  let ticketCard: TicketCard | null = null;
  let freePass: FreePassCard | null = null;
  let gateSale: GateSalePanel | null = null;
  /** Spectators (OP-191): whether the owl walks the park as one, and what Get a Day Ticket does. */
  let spectator = false;
  let getTicket: ((line: string) => void) | null = null;
  let roomId = '';
  // The thanks ladder for feedback (OP-272), as last heard, its card, and a fresh look at it.
  let rewardView: FeedbackRewardView | null = null;
  let feedbackCard: FeedbackCard | null = null;
  let loadRewards: (() => void) | null = null;
  let wheel: EmoteWheel | null = null;
  let feedback: FeedbackScreen | null = null;
  let accountScreens: AccountScreens | null = null;
  /** The owl's account as the park last said (OP-139); null while accounts are off. */
  let account: OwlAccount | null = null;
  let builder: OwlBuilder | null = null;
  let collectionActions: CollectionActions | null = null;
  let wayOut: WayOutActions | null = null;
  let waysOut = { leave: false, home: false };
  /** Travel from the map (OP-130): what the room scene last said, the place whose card is open, and when places lit up. */
  let travel: TravelState | null = null;
  let picked: string | null = null;
  const sparkles = new Map<string, number>();
  let storage: Storage | null = null;
  try {
    storage = localStorage;
  } catch {
    // A browser that keeps nothing: no place sparkles.
  }
  /** The Map tab's travel, with the places lit since this device last showed them sparkling for a few seconds. */
  const mapTravel = (): MapTravel | null => {
    if (!travel || !wayOut) return null;
    const now = Date.now();
    for (const place of newlyLit(storage, travel.places)) sparkles.set(place, now);
    const fresh = [...sparkles].filter(([, at]) => now - at < SPARKLE_MS).map(([place]) => place);
    return {
      ...travel,
      fresh,
      picked,
      pick: (place) => (picked = place),
      go: (place) => {
        const why = wayOut ? wayOut.travel(place) : 'busy';
        // On its way: the Menu closes, so the owl is seen going, and the map opens next time with no card.
        if (why === null) {
          picked = null;
          closeScreens();
        }
        return why;
      },
    };
  };
  /** The tickets on this device for the Settings tab, read again at most every half minute. */
  let ticketsLoad: (() => Promise<WalletEntry[] | null>) | null = null;
  let tickets: { at: number; list: Promise<WalletEntry[] | null> } | null = null;
  const ticketsNow = (): Promise<WalletEntry[] | null> => {
    if (!ticketsLoad) return Promise.resolve(null);
    if (!tickets || Date.now() - tickets.at > 30_000) tickets = { at: Date.now(), list: ticketsLoad().catch(() => null) };
    return tickets.list;
  };
  let previewCb: ((frame: PreviewFrame | null, mirror: boolean) => void) | null = null;
  let justInTimer: ReturnType<typeof setTimeout> | undefined;
  /** When the owl last left the home screen (performance.now()), for presses meant for Play. */
  let leftHomeAt = Number.NEGATIVE_INFINITY;
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
  /** While a game plays on the pad (OP-137): what the pad's Interact does in it (Moon Flap: a flap). */
  let arcadeTap: (() => void) | null = null;
  let jumpCbs: { press: (at?: number) => void; release: (at?: number) => void } | null = null;
  let dashCb: ((at?: number) => void) | null = null;
  /** Quest news not seen yet: the dot on the Menu button and its Quests tab. */
  let questNews = false;
  /** The gated realms the keepers have opened (the realms switch), for the Menu map. */
  let openRealms: string[] = [];
  let shownActions = '';
  let here = 1;
  let park: number | null = null;
  const renderCount = () => {
    const base = here === 1 ? '1 owl here' : `${here} owls here`;
    count.textContent = park !== null && park > here ? `${base} · ${park} in the park` : base;
    // The Menu says it too, under its title: a phone's bar leaves the count out (OP-242).
    menu.subtitle(count.textContent);
  };

  // Settings: what the screen shows.
  const applySettings = () => {
    root.classList.toggle('no-stick', !settings.get().thumbstick);
  };
  settings.onChange(applySettings);
  applySettings();

  // ---- the Menu and its screens: one open at a time ----
  let sayCb: ((n: number) => boolean) | null = null;
  // One button for both on a phone (OP-242): Say opens with a way to the emotes, and the emotes with a way back.
  const sayWheel = createSayWheel(root, (n) => sayCb?.(n) ?? false, { label: 'Emotes', go: () => openScreen('emotes') });
  // The Menu (OP-108): its tabs, each drawn as it is shown.
  const menu = createMenuShell(
    root,
    [
      {
        id: 'quests',
        label: 'Quests',
        badge: () => questNews,
        render: (panel) => {
          // Looking at the tab is seeing the news.
          if (questNews) {
            questNews = false;
            questDot.hidden = true;
          }
          if (!questUi) return void panel.append(Object.assign(document.createElement('p'), { className: 'mnote', textContent: 'Your quests show here once you are in the park.' }));
          // A spectator's quests and today's tasks are locked (OP-191): the Day Ticket instead.
          if (spectator) {
            const get = Object.assign(document.createElement('button'), { type: 'button', textContent: SPECTATOR_WORDS.get });
            get.dataset['spectatorGet'] = 'quests';
            get.addEventListener('click', () => {
              closeScreens();
              getTicket?.(SPECTATOR_WORDS.locked);
            });
            return void panel.append(Object.assign(document.createElement('p'), { className: 'mnote', textContent: `${SPECTATOR_WORDS.locked} ${GATE_WORDS.buy}` }), get);
          }
          questUi.mountJournal(panel, () => menu.isOpen() && menu.tab() === 'quests');
        },
      },
      { id: 'collection', label: 'Collection', render: (panel) => renderCollection(panel, collectionState) },
      {
        id: 'nest',
        label: 'Nest',
        render: (panel) =>
          renderNest(panel, { away: waysOut.home, account: accountCards() }, () => {
            // Travel home is on the map now (OP-130): its card is open there.
            picked = 'nest';
            menu.show('map');
          }),
      },
      // In a nest, the owl's own is Your nest; another owl's is on the nests' street.
      { id: 'map', label: 'Map', render: (panel) => renderMap(panel, mapPlaceOf(roomId, !waysOut.home, openRealms, walkingMap()), openRealms, mapTravel(), walkingMap()) },
      {
        id: 'settings',
        label: 'Settings',
        render: (panel) =>
          renderSettings(
            panel,
            { settings, tickets: ticketsNow, canLeave: waysOut.leave, feedback: () => openScreen('feedback', true), title: () => openScreen('title'), leave: () => openScreen('leave'), account: accountCards(), retake: collectionActions ? () => retakeQuiz() : null },
            () => menu.refresh(),
          ),
      },
    ],
    { sound: () => settings.get().sound, calm: () => settings.get().calm },
  );
  settings.onChange(() => menu.refresh());
  const leaveCard = createLeaveCard(root, () => wayOut?.leave());
  /** About the park and Safety and privacy (about.ts): the home screen's two small screens. */
  const info = createInfoScreens(root);
  /** The card before the store (OP-153), before a purchase at the turnstiles, the pass offer or the gift shop; it closes alone on Escape. */
  const storeCard = createStoreCard(root);
  /** The turnstiles' question (OP-198), before the card before the store. */
  const gatePrompt = createGatePrompt(root);
  // Its Send feedback opens the same form as the Menu's (OP-167); closed, it gives the focus back to the home screen's Settings button.
  const settingsScreen = createSettingsScreen(root, settings, (opener) => openScreen('feedback', false, opener ?? menuBtn));
  // Which owl are you (OP-076) covers the whole screen, like the owl builder.
  const whichOwl = createWhichOwlScreen(root);
  // A tree room on a phone held upright (OP-156): a card over the game asking to turn the phone.
  const turnPhone = createTurnPhone(root);
  menu.onClose(() => menuBtn.setAttribute('aria-expanded', 'false'));
  menu.subtitle(count.textContent ?? '');

  /** The big sheets (dialogue, shop, Decorate) share the bottom of the screen: one at a time. */
  const closeSheets = () => {
    questUi?.closeDialogue();
    questUi?.closeLock();
    shop?.close();
    // Decorating ends with the sheet: the room puts its camera back.
    if (decorate?.isOpen()) decorateActions?.done();
  };
  // The arcade's game screen covers the whole park while a run is played, like the owl builder.
  const arcade = createArcadeScreen(root);
  /** A game played on the pad has it over the arcade screen while the run goes, and not after: Interact, the stick's flicks, or a pull on it. */
  const arcadePad = (tap: (() => void) | null) => {
    arcadeTap = tap;
    root.classList.toggle('arcade-pad', tap !== null);
  };
  const arcadeStick = (game: ArcadeGame | null) => {
    root.classList.toggle('arcade-stick', game === 'crossing' || game === 'sling');
    stick.flicks(game === 'crossing' ? (v) => arcade.padHop(v.y < 0 ? 'up' : v.y > 0 ? 'down' : v.x < 0 ? 'left' : 'right') : null);
    stick.pulls(game === 'sling' ? { pull: (x, y) => arcade.padPull(x, y), release: () => arcade.padRelease() } : null);
  };
  arcade.onClose(() => {
    arcadePad(null);
    arcadeStick(null);
    root.classList.remove('covered');
  });
  // So does the climb screen (the stained-glass climb), which owns its controls while it is up.
  const climb = createClimbScreen(root);
  climb.onClose(() => root.classList.remove('covered'));
  /** Close the Menu and every screen it opens. */
  const closeScreens = () => {
    arcade.close();
    climb.close();
    menu.close();
    wheel?.close();
    sayWheel.close();
    builder?.close();
    settingsScreen.close();
    whichOwl.close();
    feedback?.close();
    accountScreens?.close();
    info.close();
    leaveCard.close();
    storeCard.close();
    gatePrompt.close();
  };
  const isBlocking = () => storeCard.isOpen() || gatePrompt.isOpen() || menu.isOpen() || !!wheel?.isOpen() || sayWheel.isOpen() || !!builder?.isOpen() || settingsScreen.isOpen() || whichOwl.isOpen() || !!feedback?.isOpen() || !!accountScreens?.isOpen() || info.isOpen() || leaveCard.isOpen() || arcade.isOpen() || climb.isOpen();
  /** The account's cards for the Menu (OP-139): none while accounts are off. */
  function accountCards(): HTMLElement[] | null {
    if (!account || !accountScreens) return null;
    const screens = accountScreens;
    return accountCard(account, (button) => {
      menu.close();
      screens.openEmail('protect', button.isConnected ? button : menuBtn);
    });
  }
  /** Before a sheet or a screen opens on its own (a dialogue, the shop): close the rest. */
  const makeRoom = () => {
    closeSheets();
    closeScreens();
  };

  /** Which owl are you over everything (OP-076): the preview draws the result where the screen leaves room for it. */
  function openWhichOwl(run: Omit<WhichOwlRun, 'preview'>, opener: HTMLElement): void {
    makeRoom();
    root.classList.add('covered');
    whichOwl.open(
      {
        ...run,
        preview: (frame) => previewCb?.(frame, false),
        // Uncovered before the run's end is told, since that may open the builder (which covers again).
        done: (end) => {
          root.classList.remove('covered');
          run.done(end);
        },
      },
      opener,
    );
  }
  /**
   * Retake the quiz (the Menu's Settings tab): only the kind and colours change, never the owl's id,
   * friend code or wear. The result shows on the owl at the reveal, and goes back as it was unless
   * Keep it or Make it yours takes it on.
   */
  function retakeQuiz(): void {
    const before: OwlLook = { ...(collectionActions?.look() ?? look) };
    const apply = (l: OwlLook) => {
      look = { ...l };
      lookCb?.(look);
    };
    openWhichOwl(
      {
        firstRun: false,
        seed: `retake-${Date.now().toString(36)}`,
        base: () => ({ ...before }),
        reveal: apply,
        done: (end) => {
          if (end.kind === 'make') openScreen('owl', false, menuBtn);
          else if (end.kind !== 'keep') apply(before);
        },
      },
      menuBtn,
    );
  }

  /** `opener` takes the focus back when the screen closes (the Menu button, or a home screen button); `mirror`: Your owl opened at a mirror. */
  function openScreen(id: ScreenId, fromMenu = false, opener: HTMLElement = menuBtn, mirror = false) {
    makeRoom();
    if (id === 'menu' || id === 'quests' || id === 'map') {
      if (id === 'quests') questUi?.resetJournal();
      menu.open(id === 'menu' ? undefined : id, menuBtn);
      menuBtn.setAttribute('aria-expanded', 'true');
    } else if (id === 'emotes' && wheel) {
      // A phone has no Emotes button (OP-242): the emotes came from Say's, which takes the focus back.
      const opener = emotesBtn.offsetParent ? emotesBtn : sayBtn;
      wheel.open(opener);
      opener.setAttribute('aria-expanded', 'true');
    } else if (id === 'say') {
      sayWheel.open(sayBtn);
      sayBtn.setAttribute('aria-expanded', 'true');
    } else if (id === 'owl' && builder) {
      builder.setLook(collectionActions?.look() ?? look);
      // The builder covers the whole screen: the bar, the cards and the buttons hide under it.
      root.classList.add('covered');
      builder.open(fromMenu, undefined, opener, mirror);
    }
    // Settings before the park (the home screen's); in the park they are the Menu's Settings tab.
    else if (id === 'settings') settingsScreen.open(opener);
    else if (id === 'feedback') feedback?.open(fromMenu, opener);
    else if (id === 'leave') leaveCard.open(opener);
    // The home screen asks nothing: Play is a tap back in, to the owl's nest.
    else if (id === 'title') wayOut?.title();
  }
  const toggle = (id: ScreenId, isOpen: () => boolean) => {
    if (isOpen()) closeScreens();
    else openScreen(id);
  };
  menuBtn.addEventListener('click', () => toggle('menu', () => menu.isOpen()));
  emotesBtn.addEventListener('click', () => toggle('emotes', () => !!wheel?.isOpen()));
  sayBtn.addEventListener('click', () => toggle('say', () => sayWheel.isOpen()));
  sayWheel.onClose(() => sayBtn.setAttribute('aria-expanded', 'false'));
  interactBtn.addEventListener('click', () => {
    if (!arcadeTap) interactCb?.();
  });
  // In a game, the pad's Interact acts as the thumb goes down: a flap cannot wait for the lift.
  interactBtn.addEventListener('pointerdown', (e) => {
    if (!arcadeTap) return;
    e.preventDefault();
    arcadeTap();
  });
  // Jump goes down with the thumb and comes up with it (a hold glides); held onto the button, so a
  // thumb that drifts off it while held still holds. A click from a keyboard (no pointer) is a tap.
  /** The finger holding Jump down, so its lift is heard wherever it lands (quick taps can lose it, OP-242). */
  let jumpPointer: number | null = null;
  jumpBtn.addEventListener('pointerdown', (e) => {
    jumpPointer = e.pointerId;
    try {
      jumpBtn.setPointerCapture(e.pointerId);
    } catch {
      /* a synthetic pointer: nothing to hold on to */
    }
    jumpCbs?.press(eventTime(e));
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
    jumpBtn.addEventListener(t, (e) => {
      if (jumpPointer === e.pointerId) jumpPointer = null;
      jumpCbs?.release(eventTime(e));
    });
  for (const t of ['pointerup', 'pointercancel'] as const)
    window.addEventListener(
      t,
      (e) => {
        if (jumpPointer === null || e.pointerId !== jumpPointer || e.target === jumpBtn) return;
        jumpPointer = null;
        jumpCbs?.release(eventTime(e));
      },
      true,
    );
  jumpBtn.addEventListener('click', (e) => {
    if (e.detail !== 0 || !jumpCbs) return;
    const { press, release } = jumpCbs;
    press();
    setTimeout(release, KEY_TAP_MS);
  });
  jumpBtn.addEventListener('contextmenu', (e) => e.preventDefault()); // a long press is a glide, not the browser's menu
  // Dash goes as the thumb goes down: a dash cannot wait for the lift. A click from a keyboard is one too.
  dashBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dashCb?.(eventTime(e));
  });
  dashBtn.addEventListener('click', (e) => {
    if (e.detail === 0) dashCb?.();
  });
  dashBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  // A pressed look while the thumb is down (touch screens do not all show :active).
  for (const b of [interactBtn, jumpBtn, dashBtn]) {
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

  /** A line with a Get a Day Ticket button under it (OP-191); the button opens the turnstiles' sale with the same line. */
  const offerTicket = (line: string, ms = 9000) => {
    const el = document.createElement('div');
    el.className = 'toast';
    el.dataset['spectatorOffer'] = '';
    el.append(Object.assign(document.createElement('span'), { textContent: line }));
    const get = Object.assign(document.createElement('button'), { type: 'button', className: 'offer-get', textContent: SPECTATOR_WORDS.get });
    get.dataset['spectatorGet'] = 'offer';
    get.addEventListener('click', () => {
      el.remove();
      getTicket?.(line);
    });
    el.append(get);
    toasts.appendChild(el);
    setTimeout(() => el.remove(), ms);
  };
  const badge = createSpectatorBadge(root, () => getTicket?.(SPECTATOR_WORDS.keep));

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
      // A phone's bar keeps only a small mark for it (OP-242).
      root.classList.toggle('net-off', s === 'offline');
    },
    toast,
    attachCollection(state, actions) {
      collectionState = state;
      collectionActions = actions;
      wheel = createEmoteWheel(root, state, (e) => actions.emote(e), { label: 'Say', go: () => openScreen('say') });
      wheel.onClose(() => {
        emotesBtn.setAttribute('aria-expanded', 'false');
        if (!sayWheel.isOpen()) sayBtn.setAttribute('aria-expanded', 'false');
      });
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
          preview: (frame, mirror) => previewCb?.(frame, mirror),
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
    attachFeedback(send, rewards) {
      const showReward = (view: FeedbackRewardView | null) => {
        rewardView = view;
        feedback?.setReward(view);
        feedbackCard?.refresh(view);
      };
      feedback = createFeedbackScreen(
        root,
        async (kind, text) => {
          const sent = await send({ kind, text, room: roomId || null, screen: `${window.innerWidth}x${window.innerHeight}` });
          if (sent.reward) showReward(afterReward(rewardView, sent.reward));
          return sent;
        },
        toast,
        () => openScreen('menu'),
      );
      // Feedback by the Menu's Close, on every tab (Logan, 2026-11-03: prominent in the Menu, OP-242).
      const menuFeedback = document.createElement('button');
      menuFeedback.type = 'button';
      menuFeedback.className = 'mfeedback';
      menuFeedback.dataset['menuFeedback'] = '';
      menuFeedback.innerHTML = `${feedbackIcon('currentColor')}<span>Send feedback</span>`;
      menuFeedback.addEventListener('click', () => openScreen('feedback', true));
      menu.headButton(menuFeedback);
      // The feedback bug (OP-208): on screen everywhere until the full opening. Over a game or a
      // covering screen the form opens on top and leaves it as it was; anywhere else it opens as Settings' does.
      const openFeedback = (button: HTMLElement) => {
        if (!feedback || feedback.isOpen()) return;
        if (arcade.isOpen() || climb.isOpen() || builder?.isOpen() || whichOwl.isOpen() || accountScreens?.isOpen()) feedback.open(false, button);
        else openScreen('feedback', false, button);
      };
      createFeedbackBug(root, openFeedback);
      // A press made before, or just after, the owl left the home screen was meant for Play, even when a
      // busy page hands it over late (its timeStamp says when it was made): it never opens Feedback.
      root.addEventListener(
        'click',
        (e) => {
          if (!(e.target instanceof Element) || !e.target.closest('.fb-bug,.fb-card')) return;
          if (e.timeStamp < leftHomeAt + JUST_IN_MS) {
            e.preventDefault();
            e.stopPropagation();
          }
        },
        true,
      );
      // The thanks ladder (OP-272): a grey mouse's card beside the bug until it is won or closed.
      if (rewards) {
        feedbackCard = createFeedbackCard(root, openFeedback, () => {
          if (rewardView) showReward({ ...rewardView, closed: true });
          void rewards.close().then((v) => v && showReward(v));
        });
        loadRewards = () => void rewards.load().then((v) => v && showReward(v));
        loadRewards();
      }
    },
    attachAccount(link, deps) {
      const refresh = () =>
        void link.account().then((a) => {
          account = a;
          menu.refresh();
        });
      accountScreens = createAccountScreens(root, link, { ...deps, toast, changed: refresh });
      refresh();
      return accountScreens;
    },
    attachWayOut(actions) {
      wayOut = actions;
    },
    attachTickets(load) {
      ticketsLoad = load;
      tickets = null;
    },
    setWaysOut(ways) {
      waysOut = { ...ways };
      menu.refresh();
    },
    setTravel(state) {
      const same = travel !== null && travel.gate === state.gate && travel.places.join() === state.places.join();
      travel = { places: [...state.places], gate: state.gate };
      if (!same && menu.isOpen() && menu.tab() === 'map') menu.refresh();
    },
    attachQuests(state, actions, tasks) {
      questState = state;
      taskState = tasks;
      questUi = createQuestUi(root, bar, state, actions, makeRoom, tasks);
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
    openLock: (quest, lock) => questUi?.openLock(quest, lock),
    closeLock: () => questUi?.closeLock(),
    lockShowing: () => questUi?.lockShowing() ?? null,
    lockNote: (text) => questUi?.lockNote(text),
    toggleMenu: () => toggle('menu', () => menu.isOpen()),
    toggleMap: () => toggle('map', () => menu.isOpen() && menu.tab() === 'map'),
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
    isOwlOpen: () => !!builder?.isOpen(),
    openMirror: (opener) => openScreen('owl', false, opener ?? menuBtn, true),
    toggleJournal: () => toggle('quests', () => menu.isOpen() && menu.tab() === 'quests'),
    questNews(kind, title) {
      notice(kind === 'new' ? `New quest: ${title}` : `Quest complete: ${title}`);
      if (!(menu.isOpen() && menu.tab() === 'quests')) setQuestNews(true);
    },
    isBlocking,
    onOwlPreview(cb) {
      previewCb = cb;
    },
    setHome(on) {
      // Fresh into the park, the presses still landing where Play was (a slow nest, a rage-click) must not
      // open Feedback from the bug or its card, which now sit where Play stood: they take presses a moment later.
      if (!on && root.classList.contains('at-home')) {
        leftHomeAt = performance.now();
        root.classList.add('just-in');
        clearTimeout(justInTimer);
        justInTimer = setTimeout(() => root.classList.remove('just-in'), JUST_IN_MS);
      }
      root.classList.toggle('at-home', on);
    },
    openOwl: (opener) => openScreen('owl', false, opener),
    openSettings: (opener) => openScreen('settings', false, opener),
    openInfo: (kind, opener) => info.open(kind, opener),
    openWhichOwl,
    openShop() {
      // The feather shop and its free gift are ticket holders' (OP-191).
      if (spectator) {
        closeSheets();
        return void getTicket?.(SPECTATOR_WORDS.locked);
      }
      shop?.open();
    },
    setSpectator(on) {
      if (on === spectator) return;
      spectator = on;
      loadRewards?.();
      badge.set(on);
      if (on) shop?.close();
      menu.refresh();
    },
    onGetTicket(cb) {
      getTicket = cb;
    },
    offerTicket,
    sellAtGate(sale) {
      gateSale ??= createGateSale(root, storeCard.ask, (m, ms) => toast(m, ms ?? 4500));
      // OP-183: with the park's accounts on, an owl whose ticket is on another screen is brought here by the account's emailed link.
      const screens = accountScreens;
      gateSale.sell(withBring(sale, screens && account ? () => screens.openEmail('restore') : null));
    },
    askAtGate: (a) => gatePrompt.ask(a),
    askStore: (go, opener) => storeCard.ask(go, opener),
    showTicket(card) {
      ticketCard ??= createTicketCard(root);
      ticketCard.show(card);
    },
    openArcade(view, handlers) {
      if (!arcade.isOpen()) makeRoom();
      root.classList.add('covered');
      arcade.open(view, handlers);
      // Moon Flap plays on the pad as well as on the field: Interact flaps; Hoot & Hop hops by the stick's
      // flicks; Talon Toss aims by a pull on the stick and launches as the thumb lets go (OP-137).
      arcadePad(view.game === 'flight' ? () => arcade.padTap() : null);
      arcadeStick(view.game);
    },
    arcadePlaying: (score, banner) => arcade.playing(score, banner),
    arcadeResult: (r) => {
      arcadePad(null);
      arcadeStick(null);
      arcade.result(r);
    },
    closeArcade: () => arcade.close(),
    openClimb(view, handlers) {
      if (!climb.isOpen()) makeRoom();
      root.classList.add('covered');
      climb.open(view, handlers);
    },
    climbInput: () => climb.input(),
    climbPanes: (left, of) => climb.panes(left, of),
    climbHeader: (banked, remainingCap) => climb.header(banked, remainingCap),
    climbBand: (b) => climb.band(b),
    climbHint: (line) => climb.hint(line),
    climbResult: (r) => climb.result(r),
    closeClimb: () => climb.close(),
    offerFreePass(offer) {
      freePass ??= createFreePassCard(root, (m) => toast(m, 5000), storeCard.ask);
      freePass.show(offer);
    },
    setRoom(id) {
      roomId = id;
      // Past the turnstiles a note starts to earn: look again until it does.
      if (!rewardView?.earns) loadRewards?.();
      questUi?.setRoom(id);
      // The map's "You are here".
      menu.refresh();
    },
    setSideways(on) {
      turnPhone.set(on);
    },
    setTreeSpot(spot) {
      treeMap.set(spot, spot !== null && isBlocking());
    },
    setActions(list) {
      const key = list.map((a) => `${a.id}:${a.label}`).join('|');
      if (key === shownActions) return;
      shownActions = key;
      // The pad's Interact button does the first of them (as E does), and says which.
      interactBtn.classList.toggle('idle', list.length === 0);
      interactBtn.setAttribute('aria-disabled', String(list.length === 0));
      interactBtn.setAttribute('aria-label', list[0]?.label ?? 'Interact'); // on a phone the row's first button is tucked away, so this one carries its name
      // On a phone it wears what it does (OP-242), in place of the first button of the row.
      interactLabel.textContent = list[0]?.label ?? '';
      interactBtn.classList.toggle('labelled', list.length > 0);
      if (list[0]) interactBtn.dataset['act'] = list[0].id;
      else delete interactBtn.dataset['act'];
      actionsEl.innerHTML = '';
      list.forEach((a, i) => {
        const b = document.createElement('button');
        b.dataset['action'] = a.id;
        b.textContent = a.label;
        if (i === 0) {
          // E and the pad's Interact run the first action: it wears their '!', and the key cap shows only where there is a keyboard.
          const bang = document.createElement('span');
          bang.className = 'bang';
          bang.innerHTML = INTERACT_ICON;
          b.prepend(bang);
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
    onJump(press, release) {
      jumpCbs = { press, release };
    },
    onDash(press) {
      dashCb = press;
    },
    setDash(on) {
      dashBtn.hidden = !on;
    },
    setOpenRealms(open) {
      openRealms = [...open];
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
        b.style.top = `${h.y.toFixed(1)}px`;
        b.style.setProperty('--tint', h.tint);
        b.setAttribute('aria-label', h.label);
        (b.firstChild as HTMLElement).style.transform = `rotate(${h.angle.toFixed(3)}rad)`;
        let words = b.querySelector('span');
        if (!h.text) {
          words?.remove();
          b.classList.remove('say', 'flip');
          b.style.left = `${h.x.toFixed(1)}px`;
          continue;
        }
        // Words beside the arrow, toward the middle of the screen, and the whole chip kept on it.
        if (!words) words = b.appendChild(document.createElement('span'));
        words.textContent = h.text;
        const flip = h.x > window.innerWidth / 2;
        b.classList.add('say');
        b.classList.toggle('flip', flip);
        const w = b.offsetWidth;
        const left = flip ? h.x + 22 - w : h.x - 22;
        b.style.left = `${Math.max(4, Math.min(window.innerWidth - w - 4, left)).toFixed(1)}px`;
      }
      for (const [id, b] of hintEls) {
        if (seen.has(id)) continue;
        b.remove();
        hintEls.delete(id);
      }
      unstackHints([...hintEls.values()]);
    },
    onHint(cb) {
      hintCb = cb;
    },
    setNestWelcome(shown) {
      nestWelcome.classList.toggle('show', shown);
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
    coveredEdges: () =>
      coveredBy(
        [...root.querySelectorAll<HTMLElement>('.bar .pill, .bar .feathers, [data-menu-btn], [data-emotes-btn], [data-say-btn]')].map((el) => el.getBoundingClientRect()),
        window.innerHeight,
      ),
  };
}

/**
 * Chips that would lie over one another, a doorway's words reaching from one edge across a narrow
 * screen to a chip on the other (a phone in the Party Grove): each one lower down moved below the
 * ones it would cover, so every chip's words read whole.
 */
function unstackHints(chips: HTMLElement[]): void {
  const GAP = 6;
  const laid = chips.map((el) => ({ el, r: el.getBoundingClientRect() })).sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
  const kept: Array<{ left: number; right: number; top: number; bottom: number }> = [];
  for (const { el, r } of laid) {
    let top = r.top;
    for (let moved = true; moved; ) {
      moved = false;
      for (const k of kept) {
        if (r.left < k.right && r.right > k.left && top < k.bottom + GAP && top + r.height > k.top - GAP) {
          top = k.bottom + GAP;
          moved = true;
        }
      }
    }
    // No room below on the screen: it stays where it was put.
    if (top + r.height > window.innerHeight - 4) top = r.top;
    if (top !== r.top) el.style.top = `${(parseFloat(el.style.top) + top - r.top).toFixed(1)}px`;
    kept.push({ left: r.left, right: r.right, top, bottom: top + r.height });
  }
}

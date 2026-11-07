import { analytics } from '@heycatch/sdk';
import Phaser from 'phaser';
import { LEFT_PARK_SPAWN, LOBBY_ROOM, RESTART_HOME, SETUP_WORDS, TICKET_ENDED_HOME, TREE_STREET_ROOM, nestRoomId, parseVariant, putOn, type BuyResult, type ClosedView, type GiftResult, type Inventory, type LineStatus, type OwlLook, type PuzzleView, type QuestBoard, type ShopView, type TaskView } from '@owl-park/shared';
import { createCollections } from './collect';
import { QuestState } from './collect/quests';
import { CollectionState } from './collect/state';
import { TaskState } from './collect/tasks';
import { readConfig } from './config';
import { useSizeBoxes } from './game/art';
import { BootScene } from './game/BootScene';
import { BuilderScene } from './game/BuilderScene';
import { HOME_SHOWN, HomeScene } from './game/HomeScene';
import { mirrorKey } from './game/nestPlan';
import { NEST_SPAWN, RESTARTED_KEY, RoomScene, SETUP_KEY, TICKET_ENDED_KEY, type RoomStart } from './game/RoomScene';
import { startWalking, walkingMap } from './game/walkingMap';
import { TREE_ARRIVAL } from './rooms';
import { forgetOwl, holdsOwl, loadLook, loadPlayerId, saveLook } from './identity';
import { OPEN_ENTRY, createTransport, type ScanReply, type WalletEntry } from './net';
import { closeFeedbackCard, feedbackRewards, sendFeedbackNote } from './net/feedback';
import { storedKeeper } from './net/keeper';
import { readAccountLink, withoutAccountLink } from './net/accountLinks';
import { readTicketLink, withoutTicketLink } from './net/ticketLinks';
import { HOME_WORDS, createHomeScreen, walletSummary } from './ui/home';
import { createHud } from './ui/hud';
import { CHECKOUT_WORDS, arrivedWords, createCheckoutWatch } from './ui/checkout';
import { checkoutReturnPage, isCheckoutReturn, pageChannel, returnId, showReturnScreen, withoutCheckoutReturn } from './ui/checkoutReturn';
import { attachKeyboard, type Keys } from './ui/keyboard';
import { createLoadScreen, type LoadScreenState } from './ui/loader';
import { announcePresents } from './ui/presents';
import type { PreviewFrame } from './ui/owlBuilder';
import { linkToast } from './ui/tickets';
import { createRibbon } from './ui/ribbon';
import { createAway } from './ui/away';
import { deviceSettings } from './settings';
import { guardZoom } from './ui/noZoom';

// HeyCatch analytics (heycatch.ai/agents.md): once, at module scope, before anything else runs, so the
// page's visits and clicks and the reserved short links (/a to /z, /0 to /9) are seen from the first
// load. The key is publishable. The page's policy lets the SDK reach its host (apps/edge/src/guard.ts).
analytics.init({
  projectKey: 'hck_pk_um42q9Cyv2nIM-aHBobpaoE1rupLU1dm',
  site: 'landing',
  install: {
    framework: 'web',
    agent: 'claude-code',
  },
});

// The page's intro (index.html, #intro: the SEO audit's h1, definition and links for crawlers and pages
// without scripts) goes once the park runs, so the home screen's own h1 is the page's only one.
document.getElementById('intro')?.remove();

// Back from the store's checkout (OP-190, ui/checkoutReturn.ts): the store sends the buyer to
// `?checkout=done`. A game page watching for the ticket answers, and this window (checkout's own)
// closes or says the ticket is waiting in the park window, with Play here instead; with no answer
// the park starts here, and Play takes the owl through the turnstiles once the ticket is on it.
const checkoutBack = isCheckoutReturn(location.search)
  ? await checkoutReturnPage({
      make: pageChannel,
      id: returnId(),
      clean: () => history.replaceState(history.state, '', withoutCheckoutReturn(location.href)),
      close: () => window.close(),
      screen: (play) => showReturnScreen(document, play),
    })
  : null;

const cfg = readConfig();
// Size boxes (`?sizes=1`): the map's art as boxes of its sizes, set before anything loads.
useSizeBoxes(cfg.sizes);
const playerId = loadPlayerId(cfg);
const look = loadLook(cfg, playerId);
const parent = document.getElementById('game') as HTMLElement;
const settings = deviceSettings();
// The load screen (OP-129), up since the page's first paint: the boot and every room show their art coming on it.
const loadScreen = createLoadScreen({ sound: () => settings.get().sound, calm: () => settings.get().calm });
loadScreen.colour(look);
// A pinch never leaves the page zoomed on a phone (noZoom.ts).
guardZoom(document, window);
const hud = createHud(document.body, look, settings);
// The busy ribbon (OP-075) across the top of the home screen and every room.
const ribbon = createRibbon(document.getElementById('hud') as HTMLElement);
// An owl asleep a long while (OP-126): "Still here?", and the way back once it has left.
const away = createAway(document.getElementById('hud') as HTMLElement);
/** When the visitor last did anything on the page: a key, a touch, a click or a scroll (OP-126). */
const idle = { at: Date.now() };
for (const type of ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const) {
  window.addEventListener(type, () => (idle.at = Date.now()), { capture: true, passive: true });
}
let storage: Storage | null = null;
try {
  storage = localStorage;
} catch {
  storage = null; // a browser that keeps nothing
}

// The home screen (OP-065) comes first: logged in means this device holds an owl already. Asked
// before the collection starts, since one kept in this browser (local mode) is made at once.
let atHome = cfg.home;
let loggedIn = holdsOwl(storage);
if (atHome) hud.setHome(true);
const transport = createTransport(cfg);
const collection = new CollectionState(createCollections(cfg, transport));
const quests = new QuestState();
const tasks = new TaskState();

// A ticket link (C35) carries its secret in the address's fragment: take it out of the address bar
// at once, then put the link's tickets on this device. Opening one makes the owl here, if there is
// none yet: the home screen then shows it logged in, with the ticket.
const ticketLink = readTicketLink(location.hash);
if (ticketLink) {
  history.replaceState(history.state, '', withoutTicketLink(location.href));
  loggedIn = true;
  const tickets = transport.tickets;
  if (!tickets) hud.toast("Ticket links work on the park's own server.", 5000);
  else
    void tickets.open(ticketLink).then(
      (wallet) => {
        hud.toast(linkToast(ticketLink.kind, wallet), 5000);
        if (wallet === 'in-use') home.note(HOME_WORDS.inUse);
        else if (wallet?.some((t) => t.status === 'unused' || t.status === 'active' || t.status === 'held')) home.note(HOME_WORDS.added);
        void refreshWallet();
      },
      () => hud.toast('Your ticket could not be loaded just now. Open the link again in a moment.', 5000),
    );
}
// An owl on this device keeps its look from now on (one from before the home screen, with a
// collection but no kept look, was given new colours each visit).
if (loggedIn) saveLook(look);

const dpr = cfg.pixelRatio;
const size = () => ({ w: Math.round(window.innerWidth * dpr), h: Math.round(window.innerHeight * dpr) });
const s0 = size();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent,
  width: s0.w,
  height: s0.h,
  backgroundColor: '#0C1E36',
  // Render at device pixels, display at CSS pixels: crisp on phones, and Phaser maps input through the zoom.
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
  input: { activePointers: 2 },
  render: { antialias: true, pixelArt: false, roundPixels: false },
  // No game object uses Phaser's FX (bloom, glow, blur and the like). Left on, they make the renderer
  // build about a hundred render targets as it starts, some 180 MB of GPU memory on a phone, before
  // the first frame (OP-129).
  disablePreFX: true,
  disablePostFX: true,
  // The owl builder's preview draws over the room (which keeps running underneath) or the home screen;
  // the arcade's games and the climb draw over the room, added after these the first time one is played
  // (game/lazyScenes.ts, OP-204).
  scene: [BootScene, RoomScene, HomeScene, BuilderScene],
});

game.registry.set('config', cfg);
game.registry.set('playerId', playerId);
game.registry.set('look', look);
game.registry.set('hud', hud);
game.registry.set('settings', settings);
game.registry.set('loadScreen', loadScreen);
game.registry.events.on('changedata-look', (_parent: unknown, next: OwlLook) => loadScreen.colour(next));
game.registry.set('transport', transport);
game.registry.set('collection', collection);
game.registry.set('quests', quests);
game.registry.set('tasks', tasks);
game.registry.set('ribbon', ribbon);
game.registry.set('away', away);
game.registry.set('idle', idle);
game.registry.set('startRoom', { room: cfg.room, spawn: cfg.spawn } satisfies RoomStart);
// WASD and the arrow keys walk (the room scene reads them every frame), and so does the thumbstick on
// touch screens; E interacts (the pad's Interact on touch screens), M opens the Menu on its map (OP-130),
// T the Say wheel (1 to 8 play an emote at once), Q goes to the mirror in the owl's nest, where Your owl
// is (OP-077), and J the quests. The space bar (the pad's Jump) jumps, flaps once more in the air, and
// held on the way down glides (OP-084). A place on the map, its button held, travels there. While the
// Menu or one of its screens is open, the owl stays put. On the home screen only Q (as Play does, once there
// is an owl: into the nest, before its mirror) and Escape do anything; Enter plays too (ui/home.ts).
const interact = () => {
  if (!atHome && !hud.isBlocking()) void roomScene()?.interact();
};
const jump = (at?: number) => {
  if (!atHome && !hud.isBlocking()) roomScene()?.jumpDown(at);
};
// Letting go always reaches the owl, whatever has opened since.
const jumpEnd = (at?: number) => roomScene()?.jumpUp(at);
// Shift, or the pad's Dash: a dash, in a parkour course only (OP-224); the room scene says whether the owl holds it.
const dash = (at?: number) => {
  if (!atHome && !hud.isBlocking()) roomScene()?.dashDown(at);
};
hud.onInteract(interact);
hud.onJump(jump, jumpEnd);
hud.onDash(dash);
const keyboard = attachKeyboard(window, {
  // W or the up arrow (OP-212): in the tree, through the doorway or up the stair the owl stands in.
  up: (at) => {
    if (!atHome && !hud.isBlocking()) roomScene()?.upKey(at);
  },
  interact,
  jump,
  jumpEnd,
  dash,
  menu: () => {
    if (!atHome) hud.toggleMap();
  },
  say: () => {
    if (!atHome) hud.toggleSay();
  },
  emoteKey: (n) => {
    if (!atHome) hud.emoteKey(n);
  },
  owl: () => {
    const go = mirrorKey({ owlOpen: hud.isOwlOpen(), blocking: hud.isBlocking(), atHome, loggedIn });
    if (go === 'close') hud.toggleOwl();
    else if (go === 'nest') startPlay();
    else if (go === 'mirror') roomScene()?.toMirror();
  },
  journal: () => {
    if (!atHome) hud.toggleJournal();
  },
  close: () => hud.closePanels(),
});
game.registry.set('keys', { direction: () => (hud.isBlocking() ? null : (keyboard.direction() ?? hud.stickDirection())), detach: () => keyboard.detach() } satisfies Keys);

let resizeTimer: ReturnType<typeof setTimeout> | null = null;
window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const s = size();
    game.scale.resize(s.w, s.h);
  }, 60);
});

// Exposed for end-to-end tests and the browser console.
declare global {
  interface Window {
    owlPark: {
      game: Phaser.Game;
      playerId: string;
      transport: string;
      state(): ReturnType<RoomScene['debugState']> | null;
      /** `asKeys`: walk there as the held keys walk, which never take a doorway by themselves (OP-212). */
      walkTo(x: number, y: number, asKeys?: boolean): void;
      /** The room camera: what of the room it shows, and where on the canvas it draws it (`port`, game pixels). */
      camera(): { viewX: number; viewY: number; viewW: number; viewH: number; zoom: number; dpr: number; port: { x: number; y: number; w: number; h: number } } | null;
      /** Texture resolution actually loaded for an art key (tests check per-device rasterization). */
      textureSize(key: string): { w: number; h: number } | null;
      /** The visitor's collection as this page knows it (null until loaded). */
      collection(): Inventory | null;
      /** The quest board as this page knows it (null until the room answers). */
      quests(): QuestBoard | null;
      /** Today's three tasks as this page knows them (null until the room answers). */
      tasks(): TaskView | null;
      /** Talk to an NPC owl or use an interactable in this room, walking up first if need be. */
      talk(npc: string): boolean;
      use(target: string): boolean;
      /**
       * Press Jump now and let go exactly `holdMs` after the press takes, as the space bar and the pad's
       * Jump do (OP-084); false out of a room. The letting go is set at once, so a slow page never holds it longer.
       */
      jump(holdMs?: number): boolean;
      /** Drop the room server's socket as a bad network would; it reconnects on its own (false in the local mode). */
      drop(): boolean;
      /** As Q does: to the mirror (walking up to it in a nest, else home to it); false where it cannot. */
      mirror(): boolean;
      /** Open Your owl over the room, as the first run does (tests of the builder itself). */
      openBuilder(): void;
      /** Collect a finished quest as the quests screen does: at its giver, walking up first. */
      collect(quest: string): Promise<boolean>;
      /** Take on, drop or hand in a quest (taking and handing in mean standing by its giver). */
      accept(quest: string): Promise<boolean>;
      abandon(quest: string): Promise<boolean>;
      handIn(quest: string): Promise<boolean>;
      /** Walk to a quest item in this room (arriving picks it up). */
      gather(quest: string, n: number): boolean;
      /** A puzzle quest's run as the page has it (OP-255), a Quests-tab button on it, and a walk to one of its pieces here. */
      puzzle(quest: string): PuzzleView | null;
      puzzleAction(op: 'start' | 'near' | 'join' | 'leave', quest: string, owl?: string): Promise<boolean>;
      walkToPiece(quest: string, lock: string, kind: 'lock' | 'clue' | 'key', n?: number): boolean;
      /** The feather shop as this collector sees it, buying from it, and today's free gift. */
      shop(): Promise<ShopView>;
      buy(variant: string): Promise<BuyResult>;
      gift(): Promise<GiftResult>;
      /** Wear an owned variant in its slot. */
      equip(variant: string): boolean;
      /** Play an owned emote. */
      emote(e: string): boolean;
      /** Say a prewritten phrase by its number (false: too soon after the last, or not a phrase). */
      say(n: number): boolean;
      /** The home screen (OP-065): whether it is up, and whether this device holds an owl. */
      home(): { shown: boolean; loggedIn: boolean };
      /** The tickets on this owl (empty without the park's server). */
      wallet(): Promise<WalletEntry[]>;
      /** The arcade's run under way: its game, its seed and the game itself (null when none). */
      arcade(): ReturnType<RoomScene['arcadeRun']>;
      /** The stained-glass climb under way: its seed, what is banked, and the owl on the field (null when none). */
      climb(): ReturnType<RoomScene['climbRun']>;
      /** The scripted climber takes (or leaves) the climb's controls; false when no climb is up. For the browser tests. */
      climbAuto(on: boolean): boolean;
      /** The busy ribbon's words as shown (null while it is off or hidden), OP-075. */
      ribbon(): string | null;
      /** "Still here?" up, the way back after the owl left, or neither (OP-126). */
      away(): 'ask' | 'gone' | null;
      /** The load screen (OP-129): up or not, its progress, the fact showing and the owl's hoots. */
      loadScreen(): LoadScreenState;
      /** The turnstiles scan a ticket on this owl (by its ID, or the gate's pick); one that goes through admits this owl. */
      scan(id?: string): Promise<ScanReply>;
      /** A share link's secret for a ticket on this owl (the booth's Pass it on went with it, OP-180); null when it cannot be passed on. */
      share(id: string): Promise<string | null>;
    };
  }
}
const roomScene = () => {
  const s = game.scene.getScene('room') as RoomScene | null;
  return s && s.scene.isActive() ? s : null;
};

const lookNow = () => game.registry.get('look') as OwlLook;
/** A change to the owl off the rooms (on the home screen): kept on this device, and the next room starts from it. */
const keepLook = (next: OwlLook) => {
  game.registry.set('look', next);
  saveLook(next);
};
hud.attachCollection(collection, {
  equip: (slot, variant) => {
    const room = roomScene();
    if (room) return void room.equip(slot, variant);
    if (variant === null || collection.owns(variant)) keepLook(putOn(lookNow(), slot, variant));
  },
  emote: (e) => void roomScene()?.emote(e),
  toast: (message, ms, accent) => hud.toast(message, ms, accent),
  wear: () => roomScene()?.wear() ?? lookNow().wear,
  look: lookNow,
});
// The Menu's ways out (C43): out of the park to the lobby, travel from the map (OP-130; home lands the
// owl where Play does, OP-105: before the mirror in its own nest), and back to the home screen.
hud.attachWayOut({
  leave: () => void roomScene()?.leavePark(),
  // Null is the owl on its way; with no room scene (the home screen) there is nowhere to travel from.
  travel: (place) => {
    const room = roomScene();
    return room ? room.travel(place) : 'busy';
  },
  title: () => void roomScene()?.toHomeScreen(),
});

/**
 * The builder's preview scene draws the owl big: in the builder's frame while it is open (over its
 * plain backdrop), and beside the home screen's buttons (over the lobby's painting) while that is up.
 */
const drawOwl = (frame: PreviewFrame | null, plain: boolean) => {
  if (!frame) {
    if (game.scene.isActive('builder')) game.scene.stop('builder');
    return;
  }
  if (!game.scene.isActive('builder')) game.scene.run('builder');
  (game.scene.getScene('builder') as BuilderScene).frame(frame, plain);
};
hud.onOwlPreview((frame, mirror) => {
  // At a mirror, the room's own owl is the preview (OP-077): its camera draws it in the builder's stage.
  if (mirror) {
    roomScene()?.mirrorView(frame);
    return;
  }
  if (frame) drawOwl(frame, true);
  else drawOwl(atHome && loggedIn ? home.frame() : null, false);
});

// ---- the home screen (OP-065) ----
/**
 * From the home screen into the park, landing where `start` says (the owl's own nest, OP-105). A line
 * this owl stood in is done, and a screen left open over the home screen (the owl, Settings) closes first.
 */
function leaveHome(start: RoomStart): void {
  if (!atHome) return;
  stopLine();
  hud.closePanels();
  atHome = false;
  home.hide();
  home.note(null);
  hud.setHome(false);
  drawOwl(null, false);
  game.scene.getScene('home').scene.start('room', start satisfies RoomStart);
}
/** Back from checkout in this page (OP-190), until Play takes the owl in with the ticket; and the ticket, once it has come. */
let backFromCheckout = false;
let backWith: WalletEntry | null = null;
/** What to say once the home screen is up, when the ticket came while the park was still starting. */
let backSay: string | null = null;
/**
 * Where Play lands the owl (OP-105): in its own nest, standing before its mirror, where Your owl is
 * (OP-077), every visit and on coming back alike. A first visit's nest is made as it is asked for.
 * Should the nests not answer, the lobby, outside the turnstiles, so that Play always gets the owl in.
 * Back from checkout in this page (OP-190), the lobby before the turnstiles, with the ticket once it has come.
 * An owl the keepers send into the tree (OP-156's entries setting, its pass says so) walks the tree
 * from here: its nest's door leads out into the tree, and without a nest it starts at the tree's arrival.
 */
/** How long Play waits for the owl's nest before it takes the owl to the lobby instead. */
const NEST_WAIT_MS = 6_000;
/** The promise's answer, or `fallback` once `ms` have passed without one (the request itself runs on). */
function answerWithin<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}
async function playStart(): Promise<RoomStart> {
  if (backFromCheckout) {
    // Back from checkout in this page (OP-190): in front of the turnstiles, and through them with the ticket.
    const ticket = backWith ?? undefined;
    if (ticket) backFromCheckout = false;
    backWith = null;
    // An owl of the tree came from the tree's front gate (TREE_STREET_ROOM), and goes back before it.
    return { room: walkingMap() === 2 ? TREE_STREET_ROOM : LOBBY_ROOM, spawn: LEFT_PARK_SPAWN, ticket };
  }
  // A keeper's tab that asked for the new map (`?keeper=1&newmap=1`) walks it; anyone else, as their pass
  // says, and an owl the tree takes walks the new map unless its tab asked for the tree as it was (`?newmap=0`).
  const entry = newMapTab() ? 3 : transport.entryMap ? await transport.entryMap().catch(() => 1 as const) : 1;
  const map = entry === 2 && !cfg.oldMap ? 3 : entry;
  startWalking(map);
  // A nest that has not answered in NEST_WAIT_MS counts as none: Play never hangs on the home screen.
  const nest = await answerWithin(collection.service.homeNest(), NEST_WAIT_MS, null).catch(() => null);
  const room = nest ? nestRoomId(nest) : null;
  if (room) return { room, spawn: NEST_SPAWN };
  return map === 2 ? { room: TREE_ARRIVAL.room, spawn: TREE_ARRIVAL.spawn } : { room: LOBBY_ROOM, spawn: undefined };
}
let collecting = false;
/** Load the collection (a first visit waits for its owl to be made): worn items this collector does not own come off, and a present is announced once. */
const startCollection = () => {
  if (collecting) return;
  collecting = true;
  void collection.refresh().then(() => {
    roomScene()?.pruneWear();
    if (!collection.inv) return;
    announcePresents(collection.inv.owned, (message, ms, accent) => hud.toast(message, ms, accent), storage);
  });
};
/** Whether this device holds a ticket that has not run out (the line says its clock waits for the gate). */
let holdsTicket = false;
/** The line under Play: the tickets on this device, and the gate (the room server only). */
async function refreshWallet(): Promise<void> {
  const tickets = transport.tickets;
  if (!tickets || !loggedIn) return home.setWallet(null);
  try {
    const [list, entry] = await Promise.all([tickets.wallet(), transport.entry?.() ?? Promise.resolve(OPEN_ENTRY)]);
    holdsTicket = list.some((t) => t.status === 'unused' || t.status === 'active');
    if (atHome) home.setWallet(walletSummary(list, entry.gate, Date.now()));
  } catch {
    home.setWallet(null);
  }
}

// ---- the line (OP-075): on a busy night a new owl waits on the home screen for its turn ----
let lineTimer: ReturnType<typeof setTimeout> | null = null;
/** The number this owl holds in the line, while it waits. */
let lineNumber: number | null = null;
/** How long a page told its network holds its share of the line waits before asking again (OP-244). */
const LINE_FULL_RETRY_MS = 30_000;
const lineSoon = (fn: () => void, ms: number) => {
  if (lineTimer) clearTimeout(lineTimer);
  lineTimer = setTimeout(() => {
    lineTimer = null;
    fn();
  }, ms);
};
const stopLine = () => {
  if (lineTimer) clearTimeout(lineTimer);
  lineTimer = null;
  lineNumber = null;
  home.line(null);
};
/** Play is asking for the owl's nest on its way in: another Play waits for it. */
let entering = false;
/** In at last (the line let this owl in, or there is none): into its own nest. */
const enterPark = async () => {
  if (entering) return;
  entering = true;
  try {
    leaveHome(await playStart());
  } finally {
    entering = false;
    // Still home (the park said nothing to go on): Play is itself again, ready for another press.
    if (atHome) home.opening(false);
  }
};
/** What the line said: in the park, its turn, a turn that passed, or its place (and when to look again). */
const onLine = (s: LineStatus) => {
  if (!atHome) return;
  if (s.state === 'go') return void enterPark();
  if (s.state === 'called') {
    home.line({ message: 'turn' });
    lineSoon(enterPark, 900); // a moment to read it
    return;
  }
  if (s.state === 'expired') {
    lineNumber = null;
    home.line({ message: 'passed' });
    lineSoon(() => void askLine(true), 2_500);
    return;
  }
  if (s.state === 'full') {
    // This network holds its share of the line already (OP-244): no number yet, so ask again later.
    lineNumber = null;
    home.line({ message: 'full' });
    lineSoon(() => void askLine(true), LINE_FULL_RETRY_MS);
    return;
  }
  lineNumber = s.n;
  home.line({ place: s.place, waitMin: s.waitMin, ticket: holdsTicket });
  // Near the front it looks often; further back, every so often.
  lineSoon(() => void askLine(false), s.place <= 10 ? 5_000 : 15_000);
};
/** Ask the line: for a place (or straight in), or where this owl's number stands. */
async function askLine(join: boolean): Promise<void> {
  const line = transport.line;
  if (!line || !atHome) return;
  try {
    onLine(join || lineNumber === null ? await line.join() : await line.poll(lineNumber));
  } catch {
    if (!atHome) return;
    home.line({ message: 'offline' });
    lineSoon(() => void askLine(lineNumber === null), 10_000);
  }
}
// Back on the page after a while away: look at once, since its turn may have come.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && atHome && lineNumber !== null) lineSoon(() => void askLine(false), 0);
});
/**
 * Play: into the owl's own nest, through the line when the park has one (the server says), else straight in.
 * Play says Opening the park the moment it is pressed, and takes no second press until the park has
 * answered: the line's answer and the nest can each take a moment on a slow phone, and with nothing to
 * show for a press a visitor presses again and again (and each press asked the line for a new place).
 */
const startPlay = () => {
  // Closed for setup (OP-233): no way in from here (Enter, Q, a kept owl's Keep it) while the card is up.
  if (!atHome || home.isShut() || home.inLine() || home.isOpening() || lineTimer || entering) return;
  home.opening(true);
  if (!transport.line) return void enterPark();
  void askLine(true);
};
/** The ribbon on the home screen, asked of the park (in a room, the room tells it). */
const refreshNotice = async () => {
  const words = (await transport.line?.notice()) ?? null;
  if (atHome) ribbon.set(words);
};
setInterval(() => {
  if (atHome) void refreshNotice();
}, 60_000);

// ---- closed for setup (OP-233): no Play on the home screen while the keepers have the park shut ----
/** How often the home screen asks whether the park is closed, while it is up and in view. */
const CLOSED_POLL_MS = 15_000;
/**
 * Sent home by the room because the park closed (OP-205): the room's word stands over an "open" from
 * the park for this long, since a Worker that has not heard of the closing yet may say so for up to
 * half a minute (overflowState.ts) and a browser keep it five seconds more: Play must not come back
 * for a moment and bounce the owl.
 */
const SENT_HOME_TRUST_MS = 35_000;
let sentHomeAt = Number.NEGATIVE_INFINITY;
/** A keeper's tab (OP-156: `?keeper=1`, or a token kept from earlier in the tab): its Play still walks in. */
const keeperTab = () => cfg.keeper || storedKeeper() !== null;
/** A keeper's tab that asked for the new map (`?newmap=1`): it walks it from the first room. */
function newMapTab(): boolean {
  return cfg.newMap && keeperTab();
}
// Opened straight into a room (`?room=`), the new map is walked from the first room.
if (newMapTab()) startWalking(3);
const showClosed = (v: ClosedView) => {
  if (!v.closed && Date.now() - sentHomeAt < SENT_HOME_TRUST_MS) return;
  home.closed(v.closed ? { words: v.words ?? SETUP_WORDS, reopenAt: v.reopenAt, keeper: keeperTab() } : null);
};
/** Ask the park whether it is closed; with no answer, the home screen stays as it was. */
const refreshClosed = async () => {
  const v = (await transport.closed?.()) ?? null;
  if (v && atHome) showClosed(v);
};
/** The home screen's presence line (the site audit's D3.1): the park's own count, as it stands. */
const refreshPresence = async () => {
  const n = (await transport.parkCount?.()) ?? null;
  if (atHome) home.presence(n);
};
setInterval(() => {
  if (atHome && document.visibilityState === 'visible') {
    void refreshClosed();
    void refreshPresence();
  }
}, CLOSED_POLL_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && atHome) {
    void refreshClosed();
    void refreshPresence();
  }
});
const home = createHomeScreen(document.getElementById('hud') as HTMLElement, {
  logIn: (opener) => {
    // Which owl are you (OP-076) first: the owl is made on this device at its reveal (or at Skip),
    // then Keep it goes into its nest and Make it yours (or Skip) opens the builder on it.
    const makeOwl = (look: OwlLook) => {
      if (!loggedIn) {
        loggedIn = true;
        startCollection();
        void refreshWallet();
      }
      keepLook(look);
      hud.setLook(look);
    };
    hud.openWhichOwl(
      {
        firstRun: true,
        seed: playerId,
        base: lookNow,
        reveal: makeOwl,
        done: (end) => {
          if (!atHome) return;
          if (end.kind === 'skip') makeOwl(lookNow());
          if (end.kind === 'keep' || end.kind === 'make') keepLook(end.look);
          home.show(loggedIn);
          if (loggedIn) drawOwl(home.frame(), false);
          if (end.kind === 'keep') startPlay();
          else if (end.kind === 'make' || end.kind === 'skip') hud.openOwl(opener);
        },
      },
      opener,
    );
  },
  // Look around free (the second site audit, D2.1): what Skip makes, with no quiz and no builder, then
  // Play. Every visit starts in the owl's own nest, and the turnstiles offer Enter as a guest.
  lookAround: () => {
    if (!atHome || loggedIn) return;
    loggedIn = true;
    startCollection();
    void refreshWallet();
    const look = lookNow();
    keepLook(look);
    hud.setLook(look);
    home.show(loggedIn);
    drawOwl(home.frame(), false);
    startPlay();
  },
  play: () => startPlay(),
  settings: (opener) => hud.openSettings(opener),
  restore: (opener) => accountScreens?.openEmail('restore', opener),
  stage: (frame) => {
    if (atHome && loggedIn && !hud.isBlocking()) drawOwl(frame, false);
  },
  blocked: () => hud.isBlocking(),
  info: (kind, opener) => hud.openInfo(kind, opener),
});
// The home scene came up (at the start, or from the Menu): its buttons, and the owl beside them.
game.events.on(HOME_SHOWN, () => {
  atHome = true;
  loadScreen.hide();
  hud.setHome(true);
  hud.closePanels();
  // Turned away by the line from a room: the owl is this device's, and it takes its place in the line.
  const queued = game.registry.get('queued') === true;
  if (queued) {
    game.registry.set('queued', false);
    if (!loggedIn) {
      loggedIn = true;
      keepLook(lookNow());
    }
  }
  // The room that last answered for the builder is gone: look changes are kept from here.
  hud.onLookChange((l) => keepLook({ ...lookNow(), body: l.body, belly: l.belly, accent: l.accent, ...(l.species ? { species: l.species } : {}) }));
  home.show(loggedIn);
  if (loggedIn) {
    drawOwl(home.frame(), false);
    void refreshWallet();
  }
  void refreshNotice();
  void refreshClosed();
  void refreshPresence();
  // Back from checkout (OP-190): the ticket came while the park was starting.
  if (backSay) {
    hud.toast(backSay, 6000);
    backSay = null;
  }
  if (queued) startPlay();
  // Sent home by the park's nightly restart (OP-181): said once, calmly; Play brings the owl back in.
  if (game.registry.get(RESTARTED_KEY) === true) {
    game.registry.set(RESTARTED_KEY, false);
    hud.toast(RESTART_HOME, 8000);
  }
  // Sent home because its ticket ran out mid-visit (OP-237): said once; Play brings the owl to the gate.
  if (game.registry.get(TICKET_ENDED_KEY) === true) {
    game.registry.set(TICKET_ENDED_KEY, false);
    hud.toast(TICKET_ENDED_HOME, 8000);
  }
  // Closed for setup (OP-205): the room sent the owl here with the keepers' words. The closed card
  // takes Play's place at once (OP-233), and the park's own answer fills in the reopen time.
  const setup = game.registry.get(SETUP_KEY) as string | undefined;
  if (setup) {
    game.registry.set(SETUP_KEY, undefined);
    sentHomeAt = Date.now();
    home.closed({ words: setup, reopenAt: null, keeper: keeperTab() });
    hud.toast(setup, 8000);
  }
});
// The Say wheel says a phrase here and for everyone in the room.
hud.onSay((n) => roomScene()?.say(n) ?? false);
// Every Get a Day Ticket a spectator sees (OP-191): the turnstiles' sale, from the room the owl is in.
hud.onGetTicket((line) => roomScene()?.offerDayTicket(line));
hud.attachQuests(quests, {
  accept: (quest) => roomScene()?.acceptQuest(quest) ?? Promise.resolve(false),
  abandon: (quest) => roomScene()?.abandonQuest(quest) ?? Promise.resolve(false),
  handIn: (quest) => roomScene()?.handInQuest(quest) ?? Promise.resolve(false),
  collect: (quest) => roomScene()?.collectQuest(quest) ?? Promise.resolve(false),
  openShop: () => hud.openShop(),
  puzzle: (op, quest, owl) => roomScene()?.puzzleAction(op, quest, owl) ?? Promise.resolve(false),
  tryCode: (quest, lock, code) => roomScene()?.tryCode(quest, lock, code) ?? Promise.resolve(false),
}, tasks);
// Feedback goes to the park's keepers through the room server (kept in this browser without one).
// A note that counts climbs the owl's thanks ladder (OP-272): the grey mouse, then feathers.
hud.attachFeedback(
  async (draft) => {
    const sent = await sendFeedbackNote(transport, draft, storage);
    if (sent.reward?.item && !sent.reward.dup) collection.added(sent.reward.item, sent.reward.total);
    else if (sent.reward) collection.setFeathers(sent.reward.total);
    return sent;
  },
  { load: () => feedbackRewards(transport), close: () => closeFeedbackCard(transport) },
);

// Accounts (OP-139, with the park's ACCOUNTS on): the Menu's friend code and Protect this owl, the
// home screen's I already have an owl, the links the park's mail carries, and the card a screen gets
// when its owl was brought back on another one.
const accounts = transport.accounts;
const accountScreens = accounts
  ? hud.attachAccount(accounts, {
      restart: (picked) => {
        // The owl this screen holds now, in its own colours from the first frame; then the page starts again with it.
        if (picked) saveLook({ ...picked });
        location.reload();
      },
      startOver: () => {
        forgetOwl(storage);
        location.reload();
      },
    })
  : null;
if (accounts && accountScreens) {
  accounts.onMoved(() => accountScreens.showMoved());
  void accounts.account().then((a) => home.setAccounts(a !== null));
}
// An account link carries its token in the address's fragment, as a ticket link does: out of the
// address bar at once, then the owls it brings (restore) or the owl it protects (protect). One opened
// in the tab the park is already in changes only the fragment, so the page listens for that too.
const takeAccountLink = () => {
  const link = readAccountLink(location.hash);
  if (!link) return;
  history.replaceState(history.state, '', withoutAccountLink(location.href));
  if (!accountScreens) hud.toast("Owl links work on the park's own server.", 5000);
  else if (link.kind === 'restore') accountScreens.openPictures(link.token);
  else void accountScreens.confirm(link.token);
};
takeAccountLink();
window.addEventListener('hashchange', takeAccountLink);
// The Menu's Settings tab says which tickets this device holds (OP-108), where the park's server keeps them.
hud.attachTickets(() => (transport.tickets ? transport.tickets.wallet() : Promise.resolve(null)));
// Back from checkout in this page (OP-190): the wallet is watched for the bought ticket. On the home
// screen it is said, and Play lands the owl in front of the turnstiles and on through them with it;
// in the lobby the owl goes through by itself; held for the store's check, it is only said.
if (checkoutBack && loggedIn && transport.tickets) {
  const tickets = transport.tickets;
  backFromCheckout = true;
  const back = createCheckoutWatch((_message, came) => {
    if (!came) return;
    void refreshWallet();
    const say = (words: string) => (home.isShown() || !atHome ? hud.toast(words, 6000) : (backSay = words));
    if (came.status === 'held') {
      backFromCheckout = false;
      return say(CHECKOUT_WORDS.addedHeld);
    }
    if (atHome) {
      backWith = came;
      home.note(HOME_WORDS.added);
      return say(CHECKOUT_WORDS.addedHome);
    }
    backFromCheckout = false;
    // On the way in (the lobby still loading), it waits for the room, a little while.
    const inRoom = (tries: number) => {
      const room = roomScene();
      if (!room && !atHome && tries < 40) return void setTimeout(() => inRoom(tries + 1), 500);
      hud.toast(arrivedWords(came, room?.ticketCame(came) ?? false), 6000);
    };
    inRoom(0);
  });
  back.start({ wallet: () => tickets.wallet(), before: new Set(), win: null });
  back.look();
}
// The collection loads in the background, once there is an owl to collect for.
if (!cfg.home || loggedIn) startCollection();
collection.onChange(() => roomScene()?.pruneWear());
window.owlPark = {
  game,
  playerId,
  transport: transport.kind,
  state: () => roomScene()?.debugState() ?? null,
  walkTo: (x, y, asKeys) => (asKeys ? roomScene()?.walkAsKeys({ x, y }) : roomScene()?.walkTo({ x, y })),
  camera: () => {
    const s = roomScene();
    if (!s) return null;
    const c = s.cameras.main;
    const v = c.worldView;
    return { viewX: v.x, viewY: v.y, viewW: v.width, viewH: v.height, zoom: c.zoom, dpr, port: { x: c.x, y: c.y, w: c.width, h: c.height } };
  },
  textureSize: (key) => {
    if (!game.textures.exists(key)) return null;
    const src = game.textures.get(key).getSourceImage() as { width: number; height: number };
    return { w: src.width, h: src.height };
  },
  collection: () => collection.inv,
  quests: () => quests.board,
  tasks: () => tasks.view,
  talk: (npc) => roomScene()?.goDo({ kind: 'talk', id: npc }) ?? false,
  jump: (holdMs = 0) => roomScene()?.jumpFor(holdMs) ?? false,
  drop: () => roomScene()?.dropConnection() ?? false,
  mirror: () => roomScene()?.toMirror() ?? false,
  openBuilder: () => hud.openOwl(document.body),
  collect: (quest) => roomScene()?.collectQuest(quest) ?? Promise.resolve(false),
  use: (target) => roomScene()?.goDo({ kind: 'use', id: target }) ?? false,
  accept: (quest) => roomScene()?.acceptQuest(quest) ?? Promise.resolve(false),
  abandon: (quest) => roomScene()?.abandonQuest(quest) ?? Promise.resolve(false),
  handIn: (quest) => roomScene()?.handInQuest(quest) ?? Promise.resolve(false),
  gather: (quest, n) => roomScene()?.walkToItem(quest, n) ?? false,
  puzzle: (quest) => roomScene()?.puzzleView(quest) ?? null,
  puzzleAction: (op, quest, owl) => roomScene()?.puzzleAction(op, quest, owl) ?? Promise.resolve(false),
  walkToPiece: (quest, lock, kind, n) => roomScene()?.walkToPiece(quest, lock, kind, n) ?? false,
  shop: () => collection.shop(),
  buy: (variant) => collection.buy(variant),
  gift: () => collection.claimGift(),
  equip: (variant) => {
    const v = parseVariant(variant);
    if (!v || v.item.kind === 'emote') return false;
    const slot = v.item.kind === 'wear' ? v.item.slot : v.item.kind;
    return slot ? (roomScene()?.equip(slot, variant) ?? false) : false;
  },
  emote: (e) => roomScene()?.emote(e) ?? false,
  say: (n) => roomScene()?.say(n) ?? false,
  home: () => ({ shown: home.isShown(), loggedIn }),
  wallet: () => transport.tickets?.wallet() ?? Promise.resolve([]),
  arcade: () => roomScene()?.arcadeRun() ?? null,
  climb: () => roomScene()?.climbRun() ?? null,
  climbAuto: (on) => roomScene()?.climbAuto(on) ?? false,
  ribbon: () => ribbon.shown(),
  away: () => away.shown(),
  loadScreen: () => loadScreen.state(),
  scan: (id) => transport.tickets?.scan(id) ?? Promise.resolve({ ok: false, reason: 'none' }),
  share: (id) => transport.tickets?.share(id) ?? Promise.resolve(null),
};

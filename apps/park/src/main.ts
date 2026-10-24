import Phaser from 'phaser';
import { LOBBY_ROOM, nestRoomId, parseVariant, putOn, type BuyResult, type GiftResult, type Inventory, type LineStatus, type OwlLook, type QuestBoard, type ShopView, type TaskView } from '@owl-park/shared';
import { createCollections } from './collect';
import { QuestState } from './collect/quests';
import { CollectionState } from './collect/state';
import { TaskState } from './collect/tasks';
import { readConfig } from './config';
import { BootScene } from './game/BootScene';
import { ArcadeScene } from './game/ArcadeScene';
import { BuilderScene } from './game/BuilderScene';
import { HOME_SHOWN, HomeScene } from './game/HomeScene';
import { mirrorKey } from './game/nestPlan';
import { RoomScene, type RoomStart } from './game/RoomScene';
import { holdsOwl, loadLook, loadPlayerId, saveLook } from './identity';
import { OPEN_ENTRY, createTransport, type ScanReply, type WalletEntry } from './net';
import { sendFeedback } from './net/feedback';
import { readTicketLink, withoutTicketLink } from './net/ticketLinks';
import { HOME_WORDS, createHomeScreen, walletSummary } from './ui/home';
import { createHud } from './ui/hud';
import { attachKeyboard, type Keys } from './ui/keyboard';
import { announcePresents } from './ui/presents';
import type { PreviewFrame } from './ui/owlBuilder';
import { linkToast } from './ui/tickets';
import { createRibbon } from './ui/ribbon';
import { deviceSettings } from './settings';

const cfg = readConfig();
const playerId = loadPlayerId(cfg);
const look = loadLook(cfg, playerId);
const parent = document.getElementById('game') as HTMLElement;
const settings = deviceSettings();
const hud = createHud(document.body, look, settings);
// The busy ribbon (OP-075) across the top of the home screen and every room.
const ribbon = createRibbon(document.getElementById('hud') as HTMLElement);
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
        if (wallet?.some((t) => t.status === 'unused' || t.status === 'active' || t.status === 'held')) home.note(HOME_WORDS.added);
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
  // The owl builder's preview draws over the room (which keeps running underneath) or the home screen;
  // the arcade's games draw over the room.
  scene: [BootScene, RoomScene, HomeScene, BuilderScene, ArcadeScene],
});

game.registry.set('config', cfg);
game.registry.set('playerId', playerId);
game.registry.set('look', look);
game.registry.set('hud', hud);
game.registry.set('settings', settings);
game.registry.set('transport', transport);
game.registry.set('collection', collection);
game.registry.set('quests', quests);
game.registry.set('tasks', tasks);
game.registry.set('ribbon', ribbon);
game.registry.set('startRoom', { room: cfg.room, spawn: cfg.spawn } satisfies RoomStart);
// WASD and the arrow keys walk (the room scene reads them every frame), and so does the thumbstick on
// touch screens; E interacts and the space bar hops (the pad's Interact and Jump on touch screens), M
// opens the Menu, T the Say wheel (1 to 8 play an emote at once), Q goes to the mirror in the owl's
// nest, where Your owl is (OP-077), and J the quests. While the Menu or one of its screens is open,
// the owl stays put. On the home screen only Q (as Play does, once there is an owl: into the nest,
// before its mirror) and Escape do anything; Enter plays too (ui/home.ts).
const interact = () => {
  if (!atHome && !hud.isBlocking()) void roomScene()?.interact();
};
const jump = () => {
  if (!atHome && !hud.isBlocking()) roomScene()?.jump();
};
hud.onInteract(interact);
hud.onJump(jump);
const keyboard = attachKeyboard(window, {
  interact,
  jump,
  menu: () => {
    if (!atHome) hud.toggleMenu();
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
      walkTo(x: number, y: number): void;
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
      /** Hop, as the Jump button and the space bar do (false: too soon after the last one). */
      jump(): boolean;
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
      /** The tickets on this device (empty without the park's server). */
      wallet(): Promise<WalletEntry[]>;
      /** The arcade's run under way: its game, its seed and the game itself (null when none). */
      arcade(): ReturnType<RoomScene['arcadeRun']>;
      /** The busy ribbon's words as shown (null while it is off or hidden), OP-075. */
      ribbon(): string | null;
      /** The turnstiles scan a ticket on this device (by its ID, or the gate's pick); one that goes through admits this owl. */
      scan(id?: string): Promise<ScanReply>;
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
// The Menu's ways out (C43): out of the park to the lobby, home to the owl's own nest, and back to the home screen.
hud.attachWayOut({
  leave: () => void roomScene()?.leavePark(),
  home: () => void roomScene()?.goHome(),
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
/**
 * Where Play lands the owl (OP-105): in its own nest, standing before its mirror, where Your owl is
 * (OP-077), every visit and on coming back alike. A first visit's nest is made as it is asked for.
 * Should the nests not answer, the lobby, outside the turnstiles, so that Play always gets the owl in.
 */
async function playStart(): Promise<RoomStart> {
  const nest = await collection.service.homeNest().catch(() => null);
  const room = nest ? nestRoomId(nest) : null;
  return room ? { room, spawn: 'mirror' } : { room: LOBBY_ROOM, spawn: undefined };
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
/** Play: into the owl's own nest, through the line when the park has one (the server says), else straight in. */
const startPlay = () => {
  if (!atHome || home.inLine() || lineTimer || entering) return;
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
const home = createHomeScreen(document.getElementById('hud') as HTMLElement, {
  logIn: (opener) => {
    // The owl is made on this device, and the builder opens on it before anything else.
    loggedIn = true;
    keepLook(lookNow());
    startCollection();
    home.show(true);
    drawOwl(home.frame(), false);
    void refreshWallet();
    hud.openOwl(opener);
  },
  play: () => startPlay(),
  settings: (opener) => hud.openSettings(opener),
  stage: (frame) => {
    if (atHome && loggedIn && !hud.isBlocking()) drawOwl(frame, false);
  },
  blocked: () => hud.isBlocking(),
});
// The home scene came up (at the start, or from the Menu): its buttons, and the owl beside them.
game.events.on(HOME_SHOWN, () => {
  atHome = true;
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
  if (queued) startPlay();
});
// The Say wheel says a phrase here and for everyone in the room.
hud.onSay((n) => roomScene()?.say(n) ?? false);
hud.attachQuests(quests, {
  accept: (quest) => roomScene()?.acceptQuest(quest) ?? Promise.resolve(false),
  abandon: (quest) => roomScene()?.abandonQuest(quest) ?? Promise.resolve(false),
  handIn: (quest) => roomScene()?.handInQuest(quest) ?? Promise.resolve(false),
  collect: (quest) => roomScene()?.collectQuest(quest) ?? Promise.resolve(false),
  openShop: () => hud.openShop(),
}, tasks);
// Feedback goes to the park's keepers through the room server (kept in this browser without one).
hud.attachFeedback((draft) => sendFeedback(transport, draft, storage));
// The collection loads in the background, once there is an owl to collect for.
if (!cfg.home || loggedIn) startCollection();
collection.onChange(() => roomScene()?.pruneWear());
window.owlPark = {
  game,
  playerId,
  transport: transport.kind,
  state: () => roomScene()?.debugState() ?? null,
  walkTo: (x, y) => roomScene()?.walkTo({ x, y }),
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
  jump: () => roomScene()?.jump() ?? false,
  mirror: () => roomScene()?.toMirror() ?? false,
  openBuilder: () => hud.openOwl(document.body),
  collect: (quest) => roomScene()?.collectQuest(quest) ?? Promise.resolve(false),
  use: (target) => roomScene()?.goDo({ kind: 'use', id: target }) ?? false,
  accept: (quest) => roomScene()?.acceptQuest(quest) ?? Promise.resolve(false),
  abandon: (quest) => roomScene()?.abandonQuest(quest) ?? Promise.resolve(false),
  handIn: (quest) => roomScene()?.handInQuest(quest) ?? Promise.resolve(false),
  gather: (quest, n) => roomScene()?.walkToItem(quest, n) ?? false,
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
  ribbon: () => ribbon.shown(),
  scan: (id) => transport.tickets?.scan(id) ?? Promise.resolve({ ok: false, reason: 'none' }),
};

import Phaser from 'phaser';
import { parseVariant, type BuyResult, type GiftResult, type Inventory, type OwlLook, type QuestBoard, type ShopView, type TaskView } from '@owl-park/shared';
import { createCollections } from './collect';
import { QuestState } from './collect/quests';
import { CollectionState } from './collect/state';
import { TaskState } from './collect/tasks';
import { readConfig } from './config';
import { BootScene } from './game/BootScene';
import { BuilderScene } from './game/BuilderScene';
import { RoomScene, type RoomStart } from './game/RoomScene';
import { loadLook, loadPlayerId } from './identity';
import { createTransport, type WalletEntry } from './net';
import { sendFeedback } from './net/feedback';
import { readTicketLink, withoutTicketLink } from './net/ticketLinks';
import { createHud } from './ui/hud';
import { attachKeyboard, type Keys } from './ui/keyboard';
import { announcePresents } from './ui/presents';
import { linkToast } from './ui/tickets';
import { deviceSettings } from './settings';

const cfg = readConfig();
const playerId = loadPlayerId(cfg);
const look = loadLook(cfg, playerId);
const parent = document.getElementById('game') as HTMLElement;
const settings = deviceSettings();
const hud = createHud(document.body, look, settings);
const transport = createTransport(cfg);
const collection = new CollectionState(createCollections(cfg, transport));
const quests = new QuestState();
const tasks = new TaskState();

// A ticket link (C35) carries its secret in the address's fragment: take it out of the address bar
// at once, then put the link's tickets on this device.
const ticketLink = readTicketLink(location.hash);
if (ticketLink) {
  history.replaceState(history.state, '', withoutTicketLink(location.href));
  const tickets = transport.tickets;
  if (!tickets) hud.toast("Ticket links work on the park's own server.", 5000);
  else
    void tickets.open(ticketLink).then(
      (wallet) => hud.toast(linkToast(ticketLink.kind, wallet), 5000),
      () => hud.toast('Your ticket could not be loaded just now. Open the link again in a moment.', 5000),
    );
}

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
  // The owl builder's preview draws over the room, which keeps running underneath.
  scene: [BootScene, RoomScene, BuilderScene],
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
game.registry.set('startRoom', { room: cfg.room, spawn: cfg.spawn } satisfies RoomStart);
// WASD and the arrow keys walk (the room scene reads them every frame), and so does the thumbstick on
// touch screens; E interacts, M opens the Menu, T the emote wheel (1 to 8 play an emote at once), Q
// the owl builder and J the quests. While the Menu or one of its screens is open, the owl stays put.
const keyboard = attachKeyboard(window, {
  interact: () => {
    if (!hud.isBlocking()) void roomScene()?.interact();
  },
  menu: () => hud.toggleMenu(),
  emotes: () => hud.toggleEmotes(),
  emoteKey: (n) => hud.emoteKey(n),
  owl: () => hud.toggleOwl(),
  journal: () => hud.toggleJournal(),
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
      camera(): { viewX: number; viewY: number; viewW: number; viewH: number; zoom: number; dpr: number } | null;
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
      /** The tickets on this device (empty without the park's server). */
      wallet(): Promise<WalletEntry[]>;
    };
  }
}
const roomScene = () => {
  const s = game.scene.getScene('room') as RoomScene | null;
  return s && s.scene.isActive() ? s : null;
};

hud.attachCollection(collection, {
  equip: (slot, variant) => void roomScene()?.equip(slot, variant),
  emote: (e) => void roomScene()?.emote(e),
  toast: (message, ms, accent) => hud.toast(message, ms, accent),
  wear: () => roomScene()?.wear(),
  look: () => game.registry.get('look') as OwlLook,
});
// The owl builder shows the owl big: its preview scene runs while the builder is open.
hud.onOwlPreview((frame) => {
  if (!frame) {
    if (game.scene.isActive('builder')) game.scene.stop('builder');
    return;
  }
  if (!game.scene.isActive('builder')) game.scene.run('builder');
  (game.scene.getScene('builder') as BuilderScene).frame(frame);
});
hud.attachQuests(quests, {
  accept: (quest) => roomScene()?.acceptQuest(quest) ?? Promise.resolve(false),
  abandon: (quest) => roomScene()?.abandonQuest(quest) ?? Promise.resolve(false),
  handIn: (quest) => roomScene()?.handInQuest(quest) ?? Promise.resolve(false),
  openShop: () => hud.openShop(),
}, tasks);
let storage: Storage | null = null;
try {
  storage = localStorage;
} catch {
  storage = null; // a browser that keeps nothing
}
// Feedback goes to the park's keepers through the room server (kept in this browser without one).
hud.attachFeedback((draft) => sendFeedback(transport, draft, storage));
// Load the collection in the background; worn items this collector does not own come off.
// A present from the park in the collection is announced once on this device.
void collection.refresh().then(() => {
  roomScene()?.pruneWear();
  if (!collection.inv) return;
  announcePresents(collection.inv.owned, (message, ms, accent) => hud.toast(message, ms, accent), storage);
});
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
    return { viewX: v.x, viewY: v.y, viewW: v.width, viewH: v.height, zoom: c.zoom, dpr };
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
  wallet: () => transport.tickets?.wallet() ?? Promise.resolve([]),
};

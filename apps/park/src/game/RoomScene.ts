import Phaser from 'phaser';
import {
  EMOTE_IDS,
  PICKUP_CLIENT_RADIUS,
  PROTOCOL_VERSION,
  ROOM_H,
  ROOM_W,
  RARITY_COLOURS,
  RARITY_NAMES,
  backgroundTiles,
  distance,
  duplicatePayout,
  filterOwnedWear,
  findSpawn,
  foregroundTiles,
  localClock,
  parseVariant,
  pointInRect,
  positionAlongWalk,
  resolveTarget,
  steerTarget,
  variantName,
  type DropView,
  type EquipSlot,
  type OwlLook,
  type PlayerState,
  type RoomDef,
  type Vec2,
  type Walk,
  type Wear,
} from '@owl-park/shared';
import type { DropsInfo } from '../collect/service';
import type { CollectionState } from '../collect/state';
import type { ParkConfig } from '../config';
import { saveLook } from '../identity';
import type { ConnectionStatus, ParkTransport, RoomConnection } from '../net';
import { castVote } from '../net/vote';
import { getRoom } from '../rooms';
import type { Hud } from '../ui/hud';
import type { Keys } from '../ui/keyboard';
import { addAmbience, addSetPieces, ensureFxTextures, type SetPieces } from './ambience';
import { loadArt, releaseArt, roomArtKeys } from './art';
import { roomScaleCap } from './artFiles';
import { placeHints } from './hints';
import { DropMarker } from './DropMarker';
import { itemScale } from './items';
import { Owl } from './Owl';

export interface RoomStart {
  room: string;
  spawn: string | undefined;
  /** Where we came from, so a full room can send us back. */
  from?: { room: string; spawn: string | undefined } | undefined;
}

/** How far a tap may drift before it counts as a drag (game pixels). */
const TAP_SLOP = 16;
/** Remote walks whose timestamps are this far off our clock are rebased to "now". */
const CLOCK_TOLERANCE_MS = 1500;

const sameWalk = (a: Walk, b: Walk): boolean => a.from.x === b.from.x && a.from.y === b.from.y && a.to.x === b.to.x && a.to.y === b.to.y;
/** Ask again after a failed pickup this long later (the owl may still be walking up). */
const PICKUP_RETRY_MS = 800;
/** How far hint chips keep from the screen's edges, in CSS pixels (clear of the HUD's top and bottom bars). */
const HINT_INSETS = { top: 64, bottom: 84, side: 30 };
/** Hint chip colours: doorways glow like the realm they lead to, spots are gold. */
const DOOR_TINTS: Record<string, string> = { market: '#FF2AA1', grove: '#FFB347' };
/** Fresh walks the held keys may plan without a change of keys (sliding round corners), so a nook never loops. */
const KEY_TURNS = 8;
/** Never wait longer than this for a window change (timers past ~24 days overflow). */
const MAX_TIMER_MS = 6 * 60 * 60 * 1000;
/** Ask for the drops again this long after a request failed (offline, or no answer in time). */
const DROPS_RETRY_MS = 5_000;

/**
 * One scene renders any room from its RoomDef: background, set pieces, the local owl,
 * every remote owl, doors, ambience and the camera. Walking is time-based so every
 * client animates the same walk identically from the same (from, to, startedAt).
 */
export class RoomScene extends Phaser.Scene {
  private room!: RoomDef;
  private me!: Owl;
  private peers = new Map<string, Owl>();
  private built = false;
  private conn: RoomConnection | null = null;
  private leaving = false;
  private cfg!: ParkConfig;
  private hud!: Hud;
  private transport!: ParkTransport;
  private playerId!: string;
  private look!: OwlLook;
  private atIdol = false;
  /** Interactive spots the owl stands in (door ids with an entry in `interactions`), in room order. */
  private spots: string[] = [];
  private keys: Keys | null = null;
  /** The direction the held keys walk in. */
  private keyDir: Vec2 | null = null;
  /** The walk under way came from the keys, so letting go of them stops it. */
  private keyWalk = false;
  private keyTurns = 0;
  /** The hint chips last sent to the HUD, so an unchanged frame touches no DOM. */
  private hintsShown = '';
  private voting = false;
  /** Set when the visitor tapped the idol from afar: vote as soon as the owl arrives. */
  private pendingVote = false;
  private pieces: SetPieces = {};
  private idolTapAt = 0;
  private cameFrom: RoomStart['from'];
  /** Bumped on every (re)start so a join that resolves for a previous room is discarded. */
  private gen = 0;
  private lastStatus: ConnectionStatus | null = null;
  private collection!: CollectionState;
  private drops: DropsInfo | null = null;
  private readonly markers = new Map<number, DropMarker>();
  /** Pickups in flight, and when a failed one may be retried. */
  private readonly picking = new Map<number, number>();
  private windowTimer: Phaser.Time.TimerEvent | null = null;
  private readonly peerEmotes = new Map<string, string>();

  constructor() {
    super('room');
  }

  init(data: RoomStart): void {
    this.room = getRoom(data.room);
    this.cfg = this.registry.get('config') as ParkConfig;
    this.hud = this.registry.get('hud') as Hud;
    this.transport = this.registry.get('transport') as ParkTransport;
    this.playerId = this.registry.get('playerId') as string;
    this.look = this.registry.get('look') as OwlLook;
    this.peers = new Map();
    this.built = false;
    this.conn = null;
    this.leaving = false;
    this.atIdol = false;
    this.spots = [];
    this.keys = (this.registry.get('keys') as Keys | undefined) ?? null;
    this.keyDir = null;
    this.keyWalk = false;
    this.keyTurns = 0;
    this.hintsShown = '';
    this.voting = false;
    this.pendingVote = false;
    this.pieces = {};
    this.cameFrom = data.from;
    this.gen += 1;
    this.lastStatus = null;
    this.collection = this.registry.get('collection') as CollectionState;
    this.drops = null;
    this.markers.clear();
    this.picking.clear();
    this.windowTimer = null;
    this.peerEmotes.clear();
    this.registry.set('currentRoom', this.room.id);
    this.registry.set('spawnName', data.spawn);
  }

  create(): void {
    void this.open();
  }

  /** Load this room's art (releasing the previous room's), then build the scene. */
  private async open(): Promise<void> {
    const gen = this.gen;
    const previous = this.registry.get('loadedRoom') as string | undefined;
    if (previous && previous !== this.room.id) releaseArt(this, roomArtKeys(previous));
    const { width, height } = this.scale.gameSize;
    const label = this.add.text(width / 2, height / 2, 'Opening…', { fontSize: '26px', color: '#F6F1E3', fontFamily: 'system-ui, sans-serif' }).setOrigin(0.5).setScrollFactor(0).setDepth(1e6);
    // A room of several tiles keeps to the same memory budget as a one-screen room, at 1x if need be.
    const textures = backgroundTiles(this.room).length + foregroundTiles(this.room).length;
    const cap = roomScaleCap(textures, this.cfg.pixelRatio, this.cfg.artScaleMax, this.cfg.roomArtBudget);
    await loadArt(this, roomArtKeys(this.room.id), this.cfg.pixelRatio, cap);
    if (gen !== this.gen || !this.scene.isActive()) return; // the scene moved on while we loaded
    this.registry.set('loadedRoom', this.room.id);
    label.destroy();
    this.build();
  }

  private build(): void {
    const { room } = this;
    ensureFxTextures(this);

    // Each tile is one screen of art at its offset. Tiles overlap their neighbours by a pixel so no
    // hairline of the clear colour shows at a join while the camera scrolls.
    for (const t of backgroundTiles(room)) this.add.image(t.x, t.y, t.key).setOrigin(0).setDisplaySize(ROOM_W + 1, ROOM_H + 1).setDepth(-1);
    this.pieces = addSetPieces(this, room, (pointer, event) => this.onIdolTap(pointer, event));
    addAmbience(this, room);
    for (const t of foregroundTiles(room)) {
      if (this.textures.exists(t.key)) this.add.image(t.x, t.y, t.key).setOrigin(0).setDisplaySize(ROOM_W, ROOM_H).setDepth(room.size.h + 100);
    }

    const spawn = findSpawn(room, this.registry.get('spawnName') as string | undefined);
    this.me = new Owl(this, this.playerId, this.look, spawn, itemScale(this.cfg.pixelRatio));

    this.setupCamera();
    this.setupInput();
    if (this.cfg.debug) this.drawDebug();

    this.hud.setCount(1);
    this.hud.setActions([]);
    // The colour picker changes colours only: today's pledge and the worn collectibles stay.
    this.hud.onLookChange((look) => this.changeLook({ ...this.look, body: look.body, belly: look.belly, accent: look.accent }));
    this.hud.onAction((id) => this.interactions[id]?.run());
    this.hud.onHint((id) => this.walkToDoorway(id));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.cameras.main.fadeIn(350, 12, 30, 54);
    this.built = true;
    void this.connect();
  }

  override update(): void {
    if (!this.built) return;
    const now = Date.now();
    const finished = this.me.tick(now);
    if (!this.leaving) {
      this.steer();
      this.checkDoors(finished);
      this.checkDrops(now);
      this.updateHints();
    }
    for (const owl of this.peers.values()) owl.tick(now);
  }

  // ---------- networking ----------

  private snapshot(): PlayerState {
    return { id: this.playerId, look: this.look, pos: { ...this.me.pos }, walk: this.me.walk, v: PROTOCOL_VERSION };
  }

  private async connect(): Promise<void> {
    const gen = this.gen;
    const live = () => gen === this.gen && !this.leaving;
    const spawnName = this.registry.get('spawnName') as string | undefined;
    const conn = await this.transport.join(this.room.id, { ...this.snapshot(), ...(spawnName ? { spawn: spawnName } : {}) } as PlayerState, {
      onPeerState: (s) => live() && this.onPeerState(s),
      onPeerMove: (id, walk) => live() && this.onPeerMove(id, walk),
      onPeerLeave: (id) => live() && this.onPeerLeave(id),
      onStatus: (s) => live() && this.onStatus(s),
      onSelf: (pos) => {
        if (!live()) return;
        // The server decided where we stand. A walk already under way restarts from there.
        const target = this.me.walk?.to;
        this.me.place(pos);
        if (target) this.walkTo(target, this.keyWalk);
      },
      onSelfWalk: (walk) => live() && this.me.startWalk({ ...walk, from: { ...this.me.pos } }),
      onPeerLook: (id, look) => live() && this.peers.get(id)?.applyLook(look),
      onCounts: (rooms) => {
        if (!live()) return;
        this.registry.set('counts', rooms);
        this.hud.setParkCount(Object.values(rooms).reduce((a, b) => a + b, 0));
      },
      onFull: (roomId) => live() && void this.roomFull(roomId),
      onPeerEmote: (id, e) => {
        if (!live()) return;
        this.peerEmotes.set(id, e);
        this.peers.get(id)?.playEmote(e);
      },
    });
    if (!live() || !this.scene.isActive()) {
      await conn.leave();
      return;
    }
    this.conn = conn;
    void this.refreshDrops();
  }

  private onStatus(s: ConnectionStatus): void {
    this.hud.setStatus(s, this.transport.kind);
    const wentOffline = s === 'offline' && this.lastStatus !== 'offline';
    this.lastStatus = s;
    if (wentOffline && !this.leaving) this.hud.toast('You are wandering alone for now: the park could not connect.', 4000);
  }

  private async roomFull(roomId: string): Promise<void> {
    if (this.leaving) return;
    this.hud.toast('That part of the park is full right now. Try again in a moment.', 3500);
    const back = this.cameFrom ?? { room: 'hub', spawn: undefined };
    if (back.room === roomId) return;
    await this.goTo(back.room, back.spawn ?? 'default', undefined);
  }

  private onPeerState(s: PlayerState): void {
    if (s.id === this.playerId) return;
    const now = Date.now();
    let owl = this.peers.get(s.id);
    if (!owl) {
      owl = new Owl(this, s.id, s.look, s.pos, itemScale(this.cfg.pixelRatio));
      owl.setAlpha(0);
      this.tweens.add({ targets: owl, alpha: 1, duration: 400 });
      this.peers.set(s.id, owl);
      this.hud.setCount(this.peers.size + 1);
    } else {
      owl.applyLook(s.look);
    }
    if (s.walk) {
      // A snapshot keeps the last walk until the next one: a future-dated start is pulled back to
      // now, an old one is played out to its end, and one we already animate (or already finished)
      // is left alone, so heartbeats never replay a walk.
      const raw = s.walk;
      const walk = now - raw.startedAt < -CLOCK_TOLERANCE_MS ? { ...raw, startedAt: now } : raw;
      const already = owl.walk ? sameWalk(owl.walk, raw) : distance(owl.pos, raw.to) < 1;
      if (!already) {
        const { done } = positionAlongWalk(walk, now);
        if (done) owl.place(walk.to);
        else {
          owl.place(walk.from);
          owl.startWalk(walk);
        }
      }
    } else if (!owl.walking) {
      owl.place(s.pos);
    }
  }

  private onPeerMove(id: string, walk: Walk): void {
    const owl = this.peers.get(id);
    if (!owl) return;
    const w = this.rebase(walk, Date.now());
    owl.place(w.from);
    owl.startWalk(w);
  }

  private onPeerLeave(id: string): void {
    const owl = this.peers.get(id);
    if (!owl) return;
    this.peers.delete(id);
    this.hud.setCount(this.peers.size + 1);
    this.tweens.add({ targets: owl, alpha: 0, duration: 300, onComplete: () => owl.destroy() });
  }

  /** Other clocks may be off; a walk that claims to have started in the future, or long ago, restarts now. */
  private rebase(walk: Walk, now: number): Walk {
    const skew = now - walk.startedAt;
    if (skew < -CLOCK_TOLERANCE_MS || skew > CLOCK_TOLERANCE_MS) return { ...walk, startedAt: now };
    return walk;
  }

  // ---------- input and movement ----------

  private setupInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      // Phaser only emits POINTER_UP for releases on the canvas; also require the press to have been on it.
      if (this.leaving || p.downElement !== this.game.canvas) return;
      if (Date.now() - this.idolTapAt < 100) return; // the idol took this tap
      if (p.getDistance() > TAP_SLOP * this.cfg.pixelRatio) return; // a drag, not a tap
      this.pendingVote = false; // a new destination cancels a walk to the idol
      const world = this.cameras.main.getWorldPoint(p.x, p.y);
      this.walkTo({ x: world.x, y: world.y });
    });
  }

  /** WASD and the arrow keys: walk while held (sliding along edges) and stop on letting go. */
  private steer(): void {
    const dir = this.keys?.direction() ?? null;
    if (!dir) {
      if (this.keyWalk && this.me.walking) this.stop();
      this.keyDir = null;
      this.keyWalk = false;
      return;
    }
    const same = this.keyDir !== null && this.keyDir.x === dir.x && this.keyDir.y === dir.y;
    if (same && this.me.walking) return; // keep going
    if (!same) {
      this.keyDir = dir;
      this.keyTurns = KEY_TURNS;
    }
    if (this.keyTurns <= 0) return; // boxed in: wait for other keys
    this.keyTurns -= 1;
    const target = steerTarget(this.me.pos, dir, this.room.walkable);
    if (!target) {
      this.keyTurns = 0;
      return;
    }
    this.pendingVote = false; // walking away cancels a walk to the idol
    this.walkTo(target, true);
  }

  /** Stand still where the owl is and tell the room. */
  private stop(): void {
    const here = { x: Math.round(this.me.pos.x), y: Math.round(this.me.pos.y) };
    this.me.walk = null;
    this.me.pos = here;
    const walk: Walk = { from: here, to: here, startedAt: Date.now() };
    this.conn?.send({ t: 'move', id: this.playerId, walk });
    this.conn?.track(this.snapshot());
  }

  /** Chips at the screen's edge for open doorways and interactive spots the camera cannot see. */
  private updateHints(): void {
    const targets = this.room.doors.filter((d) => d.to || this.interactions[d.id]).map((d) => ({ id: d.id, x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2 }));
    const v = this.cameras.main.worldView;
    const places = placeHints(targets, { x: v.x, y: v.y, w: v.width, h: v.height }, { w: window.innerWidth, h: window.innerHeight, ...HINT_INSETS });
    const shown = places.map((p) => `${p.id}:${Math.round(p.x)},${Math.round(p.y)},${p.angle.toFixed(2)}`).join('|');
    if (shown === this.hintsShown) return;
    this.hintsShown = shown;
    this.hud.setHints(
      places.map((p) => {
        const door = this.room.doors.find((d) => d.id === p.id)!;
        const spot = this.interactions[p.id];
        return {
          ...p,
          tint: door.to ? (DOOR_TINTS[door.to.room] ?? '#C9A227') : '#FFD36A',
          label: spot ? `${spot.label}, off screen: walk there` : 'Doorway, off screen: walk there',
        };
      }),
    );
  }

  /** A hint chip was tapped: head for that doorway or spot. */
  private walkToDoorway(id: string): void {
    const door = this.room.doors.find((d) => d.id === id);
    if (!this.built || this.leaving || !door) return;
    this.pendingVote = false;
    this.walkTo({ x: door.rect.x + door.rect.w / 2, y: door.rect.y + door.rect.h / 2 });
  }

  /** E: use the interactive spot the owl stands in (the first, where two overlap). */
  interact(): boolean {
    if (!this.built || this.leaving) return false;
    const id = this.spots[0];
    if (!id) return false;
    this.interactions[id]?.run();
    return true;
  }

  /**
   * What each interactive spot offers, by its door id in the room data (a door without `to`):
   * standing in it shows a button with this label, and E or the button runs it. A new spot, such
   * as a mini game, is a door in the room data plus an entry here.
   */
  private readonly interactions: Record<string, { label: string; run: () => void }> = {
    shop: { label: 'Gift shop', run: () => this.openShop() },
    idol: { label: 'Vote for this realm', run: () => void this.vote() },
  };

  /** Tapping the realm's idol: pledge now if standing at it, otherwise walk up and pledge on arrival. */
  private onIdolTap(pointer: Phaser.Input.Pointer, event: Phaser.Types.Input.EventData): void {
    if (this.leaving || pointer.getDistance() > TAP_SLOP * this.cfg.pixelRatio) return;
    event.stopPropagation();
    this.idolTapAt = Date.now();
    if (this.atIdol) {
      void this.vote();
      return;
    }
    const spot = this.room.doors.find((d) => d.id === 'idol');
    if (!spot) return;
    this.pendingVote = true;
    this.walkTo({ x: spot.rect.x + spot.rect.w / 2, y: spot.rect.y + spot.rect.h / 2 });
  }

  /** Read-only snapshot for tests and the console. */
  debugState(): {
    room: string;
    pos: Vec2;
    walking: boolean;
    look: OwlLook;
    peers: Array<{ id: string; pos: Vec2; walking: boolean; look: OwlLook; emote: string | null }>;
    connected: boolean;
    doors: Array<{ id: string; x: number; y: number; to: string | undefined }>;
    /** Where the owl's eyes are, left (-) or right (+) of its feet: the way its painting faces. */
    eyes: number;
    /** This window's unclaimed drops in every room (only this visitor sees them). */
    drops: DropView[];
  } | null {
    if (!this.built) return null;
    return {
      room: this.room.id,
      doors: this.room.doors.map((d) => ({ id: d.id, x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2, to: d.to?.room })),
      pos: { ...this.me.pos },
      walking: this.me.walking,
      look: this.look,
      peers: [...this.peers.values()].map((o) => ({ id: o.id, pos: { ...o.pos }, walking: o.walking, look: o.look, emote: this.peerEmotes.get(o.id) ?? null })),
      connected: this.conn !== null,
      eyes: this.me.anchor('eyes').x,
      drops: this.drops?.drops ?? [],
    };
  }

  // ---------- collectibles ----------

  /** Ask for this window's drops, show the ones in this room, and come back when the window turns. */
  private async refreshDrops(): Promise<void> {
    const gen = this.gen;
    let info: DropsInfo;
    try {
      info = await this.collection.service.drops(this.conn?.link ?? null);
    } catch {
      if (gen !== this.gen || this.leaving || !this.scene.isActive()) return;
      if (!this.drops) this.hud.setFinds(null);
      this.windowTimer?.remove();
      this.windowTimer = this.time.delayedCall(DROPS_RETRY_MS, () => void this.refreshDrops());
      return;
    }
    if (gen !== this.gen || this.leaving || !this.scene.isActive()) return;
    this.drops = info;
    for (const [n, m] of this.markers) {
      if (!info.drops.some((d) => d.n === n && d.room === this.room.id)) {
        m.destroy();
        this.markers.delete(n);
      }
    }
    for (const d of info.drops) {
      if (d.room === this.room.id && !this.markers.has(d.n)) this.markers.set(d.n, new DropMarker(this, d));
    }
    this.updateFinds();
    this.windowTimer?.remove();
    this.windowTimer = info.next ? this.time.delayedCall(Math.min(MAX_TIMER_MS, Math.max(1000, info.next - Date.now() + 750)), () => void this.refreshDrops()) : null;
  }

  private updateFinds(): void {
    const info = this.drops;
    if (!info || !info.window) return this.hud.setFinds(null);
    const tz = this.collection.inv?.tz;
    const nextAt = tz ? localClock(info.next, tz) : new Date(info.next).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.hud.setFinds({ left: info.drops.length, half: info.window.endsWith('AM') ? 'AM' : 'PM', nextAt });
  }

  /** Standing on a drop picks it up (the room server double-checks where the owl is). */
  private checkDrops(now: number): void {
    for (const [n, m] of this.markers) {
      const retryAt = this.picking.get(n);
      if (retryAt !== undefined && now < retryAt) continue;
      const d = distance(this.me.pos, m);
      if (d > PICKUP_CLIENT_RADIUS || (this.me.walking && d > PICKUP_CLIENT_RADIUS / 2)) continue;
      void this.pickup(n);
    }
  }

  private async pickup(n: number): Promise<void> {
    const gen = this.gen;
    this.picking.set(n, Number.POSITIVE_INFINITY);
    const res = await this.collection.service.pickup(n, this.room.id, { ...this.me.pos }, this.conn?.link ?? null);
    if (gen !== this.gen) return;
    if (!res.ok) {
      if (res.reason === 'gone') {
        this.markers.get(n)?.destroy();
        this.markers.delete(n);
        this.picking.delete(n);
        if (this.drops) this.drops = { ...this.drops, drops: this.drops.drops.filter((d) => d.n !== n) };
        this.updateFinds();
      } else {
        this.picking.set(n, Date.now() + PICKUP_RETRY_MS);
      }
      return;
    }
    this.picking.delete(n);
    this.markers.get(n)?.collect();
    this.markers.delete(n);
    if (this.drops) this.drops = { ...this.drops, drops: this.drops.drops.filter((d) => d.n !== n), feathers: res.feathers };
    this.updateFinds();
    this.collection.found(res.variant, res.feathers);
    const v = parseVariant(res.variant);
    const colour = v ? RARITY_COLOURS[v.rarity] : undefined;
    const rarity = v ? ` (${RARITY_NAMES[v.rarity]})` : '';
    if (res.dup) this.hud.toast(`Found ${variantName(res.variant)} again: +${duplicatePayout(res.variant)} feathers (${res.feathers} in all)`, 3400, colour);
    else this.hud.toast(`Found: ${variantName(res.variant)}${rarity}`, 3600, colour);
  }

  /** Play an owned emote here and for everyone in the room. */
  emote(e: string): boolean {
    if (!this.built || !EMOTE_IDS.includes(e) || !this.collection.owns(e)) return false;
    this.me.playEmote(e);
    this.conn?.send({ t: 'emote', id: this.playerId, e });
    return true;
  }

  /** What the owl wears now. */
  wear(): Wear | undefined {
    return this.look.wear;
  }

  /** Put an owned variant on (or take a slot off) and tell the room. */
  equip(slot: EquipSlot, variant: string | null): boolean {
    if (!this.built) return false;
    if (variant !== null) {
      const v = parseVariant(variant);
      if (!v || !this.collection.owns(variant)) return false;
    }
    const wear: Wear = { ...(this.look.wear ?? {}) };
    if (variant === null) delete wear[slot];
    else wear[slot] = variant;
    const { wear: _old, ...rest } = this.look;
    this.changeLook(Object.keys(wear).length ? { ...rest, wear } : rest);
    return true;
  }

  /** Take off anything the collection does not hold (a look saved on this device by another collection). */
  pruneWear(): void {
    if (!this.built || !this.look.wear || !this.collection.inv) return;
    const kept = filterOwnedWear(this.look.wear, new Set(this.collection.inv.owned));
    if (JSON.stringify(kept ?? null) === JSON.stringify(this.look.wear)) return;
    const { wear: _old, ...rest } = this.look;
    this.changeLook(kept ? { ...rest, wear: kept } : rest);
  }

  /** Test hook: walk to drop `n` if it is in this room. */
  walkToDrop(n: number): boolean {
    const m = this.markers.get(n);
    if (!m) return false;
    this.walkTo({ x: m.x, y: m.y });
    return true;
  }

  /**
   * Public for tests and future features: walk the local owl to a room point. True if it set off.
   * `fromKeys` marks a walk the held keys own, which letting go of them stops.
   */
  walkTo(target: Vec2, fromKeys = false): boolean {
    if (!this.built) return false;
    const to = resolveTarget({ ...this.me.pos }, target, this.room.walkable);
    if (distance(to, this.me.pos) < 3) return false;
    const walk: Walk = { from: { ...this.me.pos }, to, startedAt: Date.now() };
    this.keyWalk = fromKeys;
    this.me.startWalk(walk);
    this.conn?.send({ t: 'move', id: this.playerId, walk });
    this.conn?.track(this.snapshot());
    return true;
  }

  private changeLook(look: OwlLook): void {
    this.look = look;
    this.registry.set('look', look);
    saveLook(look);
    this.me.applyLook(look);
    this.conn?.send({ t: 'state', state: this.snapshot() });
    this.conn?.track(this.snapshot());
  }

  private checkDoors(walkFinished: boolean): void {
    const pos = this.me.pos;
    const spots: string[] = [];
    for (const door of this.room.doors) {
      const inside = pointInRect(pos, door.rect);
      if (!inside) continue;
      if (door.to) {
        void this.goTo(door.to.room, door.to.spawn, { room: this.room.id, spawn: this.registry.get('spawnName') as string | undefined });
        return;
      }
      if (this.interactions[door.id]) spots.push(door.id);
      if (door.closedSign && walkFinished) this.hud.toast(door.closedSign);
    }
    if (spots.join(' ') !== this.spots.join(' ')) {
      this.spots = spots;
      this.hud.setActions(spots.map((id) => ({ id, label: this.interactions[id]!.label })));
    }
    this.atIdol = spots.includes('idol');
    if (this.atIdol && walkFinished && this.pendingVote) {
      this.pendingVote = false;
      void this.vote();
    }
  }

  /** Remember today's pledge on the owl (visible to everyone) and tell the idol. */
  private pledged(realm: string): void {
    this.pieces.idol?.react();
    if (this.look.pledge === realm) return;
    this.look = { ...this.look, pledge: realm };
    this.registry.set('look', this.look);
    this.me.applyLook(this.look);
    this.conn?.send({ t: 'state', state: this.snapshot() });
    this.conn?.track(this.snapshot());
  }

  /** The Realm Vote: one vote per ticket-holder per park day, cast here at the idol. */
  private async vote(): Promise<void> {
    if (this.voting || !this.atIdol) return;
    this.voting = true;
    try {
      const outcome = await castVote(this.transport, this.room.id);
      switch (outcome.kind) {
        case 'voted':
          this.pledged(outcome.realm);
          this.hud.toast('Your vote for this realm is in. One vote a day, so come back tomorrow.', 4000);
          break;
        case 'already':
          if (outcome.votedFor === this.room.id) this.pledged(this.room.id);
          this.hud.toast(outcome.votedFor === this.room.id ? 'You already voted for this realm today.' : 'You already voted today. Each day brings one vote.', 3500);
          break;
        case 'tickets-required':
          this.hud.toast('Voting opens with tickets: ticket-holders get one vote a day.', 4000);
          break;
        case 'unavailable':
          this.hud.toast('Voting opens when the park is online with tickets.', 3500);
          break;
        default:
          this.hud.toast('The idol did not hear you. Try again in a moment.', 3500);
      }
    } finally {
      this.voting = false;
    }
  }

  private openShop(): void {
    if (this.cfg.shopUrl) window.open(this.cfg.shopUrl, '_blank', 'noopener');
    else this.hud.toast('The gift shop opens soon.');
  }

  private async goTo(roomId: string, spawn: string, from: RoomStart['from']): Promise<void> {
    if (this.leaving) return;
    this.leaving = true;
    this.hud.setHints([]);
    this.me.walk = null;
    this.cameras.main.fadeOut(220, 12, 30, 54);
    await new Promise<void>((r) => this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => r()));
    await this.teardown();
    this.scene.start('room', { room: roomId, spawn, from } satisfies RoomStart);
  }

  private async teardown(): Promise<void> {
    this.hud.setHints([]);
    this.windowTimer?.remove();
    this.windowTimer = null;
    for (const m of this.markers.values()) m.destroy();
    this.markers.clear();
    const conn = this.conn;
    this.conn = null;
    if (conn) await conn.leave();
  }

  // ---------- camera ----------

  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.room.size.w, this.room.size.h);
    cam.startFollow(this.me, true, 0.12, 0.12);
    const fit = () => {
      const { width, height } = this.scale.gameSize;
      // Cover: the room always fills the screen; on portrait phones the camera pans sideways.
      cam.setZoom(Math.max(width / this.room.size.w, height / this.room.size.h));
    };
    fit();
    this.scale.on(Phaser.Scale.Events.RESIZE, fit);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, fit));
  }

  private drawDebug(): void {
    const g = this.add.graphics().setDepth(this.room.size.h + 200);
    g.lineStyle(3, 0x00e5ff, 0.9);
    for (const poly of this.room.walkable) g.strokePoints(poly, true);
    for (const d of this.room.doors) {
      g.lineStyle(3, d.to ? 0xc9a227 : 0xff2aa1, 0.9);
      g.strokeRect(d.rect.x, d.rect.y, d.rect.w, d.rect.h);
      this.add.text(d.rect.x, d.rect.y - 18, d.id, { fontSize: '16px', color: '#F6F1E3' }).setDepth(this.room.size.h + 201);
    }
    for (const [name, s] of Object.entries(this.room.spawns)) {
      g.fillStyle(0xf6f1e3, 1);
      g.fillCircle(s.x, s.y, 6);
      this.add.text(s.x + 8, s.y - 8, name, { fontSize: '14px', color: '#F6F1E3' }).setDepth(this.room.size.h + 201);
    }
  }
}

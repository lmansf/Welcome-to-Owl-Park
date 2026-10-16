import Phaser from 'phaser';
import {
  PROTOCOL_VERSION,
  distance,
  findSpawn,
  pointInRect,
  positionAlongWalk,
  snapToWalkable,
  type OwlLook,
  type PlayerState,
  type RoomDef,
  type Vec2,
  type Walk,
} from '@owl-park/shared';
import type { ParkConfig } from '../config';
import { saveLook } from '../identity';
import type { ConnectionStatus, ParkTransport, RoomConnection } from '../net';
import { getRoom } from '../rooms';
import type { Hud } from '../ui/hud';
import { addAmbience, addSetPieces, ensureFxTextures } from './ambience';
import { Owl } from './Owl';

export interface RoomStart {
  room: string;
  spawn: string | undefined;
}

/** How far a tap may drift before it counts as a drag (game pixels). */
const TAP_SLOP = 16;
/** Remote walks whose timestamps are this far off our clock are rebased to "now". */
const CLOCK_TOLERANCE_MS = 1500;

/**
 * One scene renders any room from its RoomDef: background, set pieces, the local owl,
 * every remote owl, doors, ambience and the camera. Walking is time-based so every
 * client animates the same walk identically from the same (from, to, startedAt).
 */
export class RoomScene extends Phaser.Scene {
  private room!: RoomDef;
  private me!: Owl;
  private peers = new Map<string, Owl>();
  private conn: RoomConnection | null = null;
  private leaving = false;
  private cfg!: ParkConfig;
  private hud!: Hud;
  private transport!: ParkTransport;
  private playerId!: string;
  private look!: OwlLook;
  private inShop = false;

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
    this.conn = null;
    this.leaving = false;
    this.inShop = false;
    this.registry.set('currentRoom', this.room.id);
    this.registry.set('spawnName', data.spawn);
  }

  create(): void {
    const { room } = this;
    ensureFxTextures(this);

    this.add.image(0, 0, room.background).setOrigin(0).setDisplaySize(room.size.w, room.size.h).setDepth(-1);
    addSetPieces(this, room);
    addAmbience(this, room);
    if (room.foreground && this.textures.exists(room.foreground)) {
      this.add.image(0, 0, room.foreground).setOrigin(0).setDisplaySize(room.size.w, room.size.h).setDepth(room.size.h + 100);
    }

    const spawn = findSpawn(room, this.registry.get('spawnName') as string | undefined);
    this.me = new Owl(this, this.playerId, this.look, spawn);

    this.setupCamera();
    this.setupInput();
    if (this.cfg.debug) this.drawDebug();

    this.hud.setCount(1);
    this.hud.showShop(false);
    this.hud.onLookChange((look) => this.changeLook(look));
    this.hud.onShop(() => this.openShop());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.cameras.main.fadeIn(350, 12, 30, 54);
    void this.connect();
  }

  override update(): void {
    const now = Date.now();
    const finished = this.me.tick(now);
    if (!this.leaving) this.checkDoors(finished);
    for (const owl of this.peers.values()) owl.tick(now);
  }

  // ---------- networking ----------

  private snapshot(): PlayerState {
    return { id: this.playerId, look: this.look, pos: { ...this.me.pos }, walk: this.me.walk, v: PROTOCOL_VERSION };
  }

  private async connect(): Promise<void> {
    const conn = await this.transport.join(this.room.id, this.snapshot(), {
      onPeerState: (s) => this.onPeerState(s),
      onPeerMove: (id, walk) => this.onPeerMove(id, walk),
      onPeerLeave: (id) => this.onPeerLeave(id),
      onStatus: (s) => this.onStatus(s),
    });
    if (this.leaving || !this.scene.isActive()) {
      await conn.leave();
      return;
    }
    this.conn = conn;
  }

  private onStatus(s: ConnectionStatus): void {
    this.hud.setStatus(s, this.transport.kind);
    if (s === 'offline') this.hud.toast('You are wandering alone for now: the park could not connect.', 4000);
  }

  private onPeerState(s: PlayerState): void {
    if (s.id === this.playerId) return;
    const now = Date.now();
    let owl = this.peers.get(s.id);
    if (!owl) {
      owl = new Owl(this, s.id, s.look, s.pos);
      owl.setAlpha(0);
      this.tweens.add({ targets: owl, alpha: 1, duration: 400 });
      this.peers.set(s.id, owl);
      this.hud.setCount(this.peers.size + 1);
    } else {
      owl.applyLook(s.look);
    }
    if (s.walk) {
      const walk = this.rebase(s.walk, now);
      const { done } = positionAlongWalk(walk, now);
      if (done) owl.place(walk.to);
      else {
        owl.place(walk.from);
        owl.startWalk(walk);
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
      if (this.leaving || this.hud.busy) return;
      if (p.getDistance() > TAP_SLOP * this.cfg.pixelRatio) return; // a drag, not a tap
      const world = this.cameras.main.getWorldPoint(p.x, p.y);
      this.walkTo({ x: world.x, y: world.y });
    });
  }

  /** Read-only snapshot for tests and the console. */
  debugState(): {
    room: string;
    pos: Vec2;
    walking: boolean;
    peers: Array<{ id: string; pos: Vec2; walking: boolean; look: OwlLook }>;
    connected: boolean;
    doors: Array<{ id: string; x: number; y: number; to: string | undefined }>;
  } {
    return {
      room: this.room.id,
      doors: this.room.doors.map((d) => ({ id: d.id, x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2, to: d.to?.room })),
      pos: { ...this.me.pos },
      walking: this.me.walking,
      peers: [...this.peers.values()].map((o) => ({ id: o.id, pos: { ...o.pos }, walking: o.walking, look: o.look })),
      connected: this.conn !== null,
    };
  }

  /** Public for tests and future features: walk the local owl to a room point. */
  walkTo(target: Vec2): void {
    const to = snapToWalkable(target, this.room.walkable);
    if (distance(to, this.me.pos) < 3) return;
    const walk: Walk = { from: { ...this.me.pos }, to, startedAt: Date.now() };
    this.me.startWalk(walk);
    this.conn?.send({ t: 'move', id: this.playerId, walk });
    this.conn?.track(this.snapshot());
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
    let shopNow = false;
    for (const door of this.room.doors) {
      const inside = pointInRect(pos, door.rect);
      if (!inside) continue;
      if (door.to) {
        void this.goTo(door.to.room, door.to.spawn);
        return;
      }
      if (door.id === 'shop') shopNow = true;
      if (door.closedSign && walkFinished) this.hud.toast(door.closedSign);
    }
    if (shopNow !== this.inShop) {
      this.inShop = shopNow;
      this.hud.showShop(shopNow);
    }
  }

  private openShop(): void {
    if (this.cfg.shopUrl) window.open(this.cfg.shopUrl, '_blank', 'noopener');
    else this.hud.toast('The gift shop opens soon.');
  }

  private async goTo(roomId: string, spawn: string): Promise<void> {
    if (this.leaving) return;
    this.leaving = true;
    this.me.walk = null;
    this.cameras.main.fadeOut(220, 12, 30, 54);
    await new Promise<void>((r) => this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => r()));
    await this.teardown();
    this.scene.start('room', { room: roomId, spawn } satisfies RoomStart);
  }

  private async teardown(): Promise<void> {
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

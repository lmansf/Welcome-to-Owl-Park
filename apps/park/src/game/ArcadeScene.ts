import Phaser from 'phaser';
import { FLAP_SPEED, type ArcadeGame, type OwlLook } from '@owl-park/shared';
import type { ParkConfig } from '../config';
import { FIELD_H, FIELD_W, runRandom } from '../arcade/field';
import { BRANCH_W, FLAP_R, FLAP_X, GROUND_Y as FLAP_GROUND, type Branch, type FlapGame } from '../arcade/flap';
import { HOP_ROWS, HOP_X, rowY, type HopGame, type Vehicle } from '../arcade/hop';
import { CRATE, GROUND_Y as KNOCK_GROUND, SLING, type Crate, type KnockGame, type Stand } from '../arcade/knock';
import { GAME_ART, GROUND_TILE_W, STAND_ART, branchHalves, groundTiles, paintable, standPieces } from '../arcade/paint';
import type { PreviewRect } from './BuilderScene';
import { Owl } from './Owl';

/** A run being played: one of the three games. */
export type ArcadeSim = HopGame | FlapGame | KnockGame;

/** Each game's neon: its cabinet's colours. */
export const ARCADE_INK: Readonly<Record<ArcadeSim['game'], { ink: number; glow: number; css: string }>> = {
  crossing: { ink: 0xff8ad0, glow: 0xff2aa1, css: '#FF2AA1' },
  flight: { ink: 0x8af4ff, glow: 0x00e5ff, css: '#00E5FF' },
  sling: { ink: 0xcdb0ff, glow: 0x8a4dff, css: '#8A4DFF' },
};
const AMBER = 0xffc46a;
const NIGHT = 0x05060d;
/** The owl is drawn at this share of its size in the rooms: the field is a small world. */
const OWL_IN_FIELD = 0.5;

/** Each game's painted field. */
const FIELD_ART: Readonly<Record<ArcadeGame, string>> = { crossing: 'arcade-hop-bg', flight: 'arcade-flap-bg', sling: 'arcade-knock-bg' };
/** The ground strip needs this many tiles to cover the field at any scroll. */
const GROUND_TILES = Math.ceil(FIELD_W / GROUND_TILE_W) + 1;

/** One image for each moving thing of a painted game (a vehicle, a half of a branch, a crate): made when it first shows, dropped once it is gone. */
class Pieces<T extends object> {
  private readonly images = new Map<T, Phaser.GameObjects.Image>();
  private seen = new Set<T>();

  constructor(private readonly make: (thing: T) => Phaser.GameObjects.Image) {}

  /** The image for a thing in this frame. */
  for(thing: T): Phaser.GameObjects.Image {
    let image = this.images.get(thing);
    if (!image) {
      image = this.make(thing);
      this.images.set(thing, image);
    }
    this.seen.add(thing);
    return image;
  }

  /** After a frame: drop the images of the things that were not in it. */
  sweep(): void {
    for (const [thing, image] of this.images) {
      if (this.seen.has(thing)) continue;
      image.destroy();
      this.images.delete(thing);
    }
    this.seen = new Set();
  }
}

/** The visitor's own look without its pet or effect: the games are played by the owl alone. */
function playingLook(look: OwlLook): OwlLook {
  const wear = look.wear ? { ...look.wear } : undefined;
  if (wear) {
    delete wear.pet;
    delete wear.fx;
  }
  return wear && Object.keys(wear).length ? { ...look, wear } : { body: look.body, belly: look.belly, accent: look.accent, ...(look.species ? { species: look.species } : {}) };
}

/**
 * A run of an arcade game drawn over the room (C40): the game's painted field and pieces (OP-059), or
 * until every piece of them has loaded, the field in neon line-art in the cabinet's colours; and the
 * visitor's own owl playing it. The scene steps the game every frame; the HUD's arcade screen around
 * it shows the score and takes the taps and keys. The room keeps running underneath, like the owl
 * builder's preview.
 */
export class ArcadeScene extends Phaser.Scene {
  private sim: ArcadeSim | null = null;
  private owl: Owl | null = null;
  /** The game's lines, clipped to the field, and the field's frame and stars around them. */
  private g: Phaser.GameObjects.Graphics | null = null;
  private frameG: Phaser.GameObjects.Graphics | null = null;
  private backdrop: Phaser.GameObjects.Rectangle | null = null;
  private rect: PreviewRect = { x: 0, y: 0, w: 1, h: 1 };
  private stars: Array<{ x: number; y: number; r: number }> = [];
  /**
   * The run's painting, clipped to the field like the lines: the field and what stands still on it,
   * then what moves (vehicles, branches, stands and crates), then the flight's ground over the
   * branches' feet. Empty while the run is drawn in neon.
   */
  private layers: { field: Phaser.GameObjects.Container; moving: Phaser.GameObjects.Container; front: Phaser.GameObjects.Container } | null = null;
  /** The painting's root, hidden while the run is in neon (so its mask costs nothing). */
  private art: Phaser.GameObjects.Container | null = null;
  private painted = false;
  private vehicles: Pieces<Vehicle> | null = null;
  private branchTops: Pieces<Branch> | null = null;
  private branchFeet: Pieces<Branch> | null = null;
  private crates: Pieces<Crate> | null = null;
  private ground: Phaser.GameObjects.Image[] = [];
  /** The stands drawn, and the stack they were drawn for. */
  private standImages: Phaser.GameObjects.Image[] = [];
  private standsShown: Stand[] | null = null;
  /** Called every frame after the game stepped. */
  private onStep: ((sim: ArcadeSim) => void) | null = null;
  /** When the game last stepped (the page's clock), null before a run's first frame. */
  private lastStep: number | null = null;
  /** A run asked for before the scene had started: it begins once the scene is up. */
  private pending: { sim: ArcadeSim; look: OwlLook; onStep: (sim: ArcadeSim) => void } | null = null;

  constructor() {
    super({ key: 'arcade' });
  }

  create(): void {
    this.backdrop = this.add.rectangle(FIELD_W / 2, FIELD_H / 2, 10, 10, NIGHT).setDepth(-10);
    this.frameG = this.add.graphics().setDepth(0).setBlendMode(Phaser.BlendModes.ADD);
    this.g = this.add.graphics().setDepth(1).setBlendMode(Phaser.BlendModes.ADD);
    const art = this.add.container(0, 0).setDepth(-5).setVisible(false);
    this.art = art;
    this.layers = { field: this.add.container(0, 0), moving: this.add.container(0, 0), front: this.add.container(0, 0) };
    art.add([this.layers.field, this.layers.moving, this.layers.front]);
    // Traffic, branches and crates come and go at the field's edges, never beyond its frame.
    const field = this.make.graphics({}, false).fillStyle(0xffffff).fillRoundedRect(8, 8, FIELD_W - 16, FIELD_H - 16, 14);
    const mask = field.createGeometryMask();
    this.g.setMask(mask);
    art.setMask(mask);
    const onResize = () => this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, onResize);
      this.owl?.destroy();
      this.owl = null;
      this.sim = null;
      this.g = null;
      this.frameG = null;
      this.backdrop = null;
      this.layers = null;
      this.art = null;
      this.painted = false;
    });
    this.layout();
    const p = this.pending;
    this.pending = null;
    if (p) this.play(p.sim, p.look, p.onStep);
  }

  /** Play a run: its game, the owl's look, and what to call as it goes. */
  play(sim: ArcadeSim, look: OwlLook, onStep: (sim: ArcadeSim) => void): void {
    if (!this.g) {
      this.pending = { sim, look, onStep };
      return;
    }
    this.sim = sim;
    this.onStep = onStep;
    this.lastStep = null;
    const rnd = runRandom(7);
    this.stars = Array.from({ length: 40 }, () => ({ x: rnd() * FIELD_W, y: rnd() * (FIELD_H - 120), r: 0.6 + rnd() * 1.4 }));
    this.owl?.destroy();
    this.owl = new Owl(this, 'arcade', playingLook(look), { x: 0, y: 0 }, 2);
    this.owl.setScale(this.owl.scaleX * OWL_IN_FIELD).setDepth(5);
    this.owl.showShadow(sim.game !== 'flight');
    this.paint(sim.game);
  }

  /** Whether the run under way is drawn from its paintings (tests ask). */
  isPainted(): boolean {
    return this.painted;
  }

  /** A piece of a game's painting at the size the game draws it, whatever the art's resolution. */
  private piece(key: string, x = 0, y = 0, frame?: string): Phaser.GameObjects.Image {
    const size = GAME_ART.crossing[key] ?? GAME_ART.flight[key] ?? GAME_ART.sling[key]!;
    return this.add.image(x, y, key, frame).setDisplaySize(size.w, size.h);
  }

  /** Lay out a run's painting when every piece of its game has loaded; otherwise it is drawn in neon. */
  private paint(game: ArcadeGame): void {
    const layers = this.layers;
    if (!layers) return;
    for (const layer of Object.values(layers)) layer.removeAll(true);
    this.vehicles = this.branchTops = this.branchFeet = this.crates = null;
    this.ground = [];
    this.standImages = [];
    this.standsShown = null;
    this.painted = paintable(game, (key) => this.textures.exists(key));
    this.art?.setVisible(this.painted);
    if (!this.painted) return;
    layers.field.add(this.piece(FIELD_ART[game]).setOrigin(0));
    const moving = (key: string, flipY = false) => () => {
      const image = this.piece(key).setOrigin(0).setFlip(true, flipY);
      layers.moving.add(image);
      return image;
    };
    if (game === 'crossing') {
      this.vehicles = new Pieces((v) => {
        const image = this.piece(v.kind === 'drone' ? 'arcade-hop-drone' : 'arcade-hop-cart');
        layers.moving.add(image);
        return image;
      });
    } else if (game === 'flight') {
      // Both halves of a branch mirrored (paint.ts), the top half upside down too, its knobbly end at the gap.
      this.branchTops = new Pieces(moving('arcade-flap-branch', true));
      this.branchFeet = new Pieces(moving('arcade-flap-branch'));
      this.ground = Array.from({ length: GROUND_TILES }, () => this.piece('arcade-flap-ground').setOrigin(0));
      layers.front.add(this.ground);
    } else {
      layers.field.add(this.piece('arcade-knock-sling', SLING.x, KNOCK_GROUND).setOrigin(0.5, 1));
      this.crates = new Pieces(() => {
        const image = this.piece('arcade-knock-crate');
        layers.front.add(image);
        return image;
      });
      // The stand's painting cut in nine, as frames of its texture (a texture loaded again needs them again).
      const texture = this.textures.get('arcade-knock-stand');
      const scale = texture.getSourceImage().width / STAND_ART.w;
      standPieces({ x: 0, y: 0, w: STAND_ART.w, h: STAND_ART.h }).forEach(({ src }, i) => {
        if (!texture.has(`nine-${i}`)) texture.add(`nine-${i}`, 0, src.x * scale, src.y * scale, src.w * scale, src.h * scale);
      });
    }
  }

  /** Where the HUD leaves room for the field (CSS pixels). */
  frame(rect: PreviewRect): void {
    this.rect = rect;
    if (this.g) this.layout();
  }

  private layout(): void {
    const cam = this.cameras.main;
    const { width, height } = this.scale.gameSize;
    cam.setViewport(0, 0, width, height);
    const k = (this.registry.get('config') as ParkConfig | undefined)?.pixelRatio ?? 1;
    const r = this.rect;
    const zoom = Math.max(0.1, Math.min((r.w * k) / FIELD_W, (r.h * k) / FIELD_H));
    cam.setZoom(zoom);
    const x = FIELD_W / 2 + (width / 2 - (r.x + r.w / 2) * k) / zoom;
    const y = FIELD_H / 2 + (height / 2 - (r.y + r.h / 2) * k) / zoom;
    cam.centerOn(x, y);
    this.backdrop?.setPosition(x, y).setSize(width / zoom + 64, height / zoom + 64);
  }

  override update(_time: number, delta: number): void {
    const sim = this.sim;
    const g = this.g;
    if (!sim || !g || !this.frameG) return;
    // The game runs on the page's own clock, not Phaser's smoothed delta: when frames stay slower than
    // Phaser's floor (200 ms, a slow device under load) it steps by an old, short delta and the game
    // would crawl at a few percent of its speed. The game's clock lets a stall go (MAX_CATCH_UP_MS).
    const now = performance.now();
    sim.advance(this.lastStep === null ? delta : now - this.lastStep);
    this.lastStep = now;
    g.clear();
    this.frameG.clear();
    this.frameLines(this.frameG, sim.game);
    if (sim.game === 'crossing') {
      if (this.painted) this.paintHop(sim);
      else this.drawHop(g, sim);
      this.placeHopOwl(sim);
    } else if (sim.game === 'flight') {
      if (this.painted) this.paintFlap(sim);
      else this.drawFlap(g, sim);
      this.placeFlapOwl(sim);
    } else {
      if (this.painted) this.paintKnock(sim);
      this.drawKnock(g, sim);
    }
    this.owl?.tick(Date.now());
    this.onStep?.(sim);
  }

  /** A line drawn twice: a wide faint glow under a thin bright core. */
  private neon(g: Phaser.GameObjects.Graphics, color: number, draw: () => void, width = 2): void {
    g.lineStyle(width * 4, color, 0.14);
    draw();
    g.lineStyle(width, color, 0.95);
    draw();
  }

  /** The field's neon frame, and its stars while it is drawn in neon (a painted field has its own sky). */
  private frameLines(g: Phaser.GameObjects.Graphics, game: ArcadeSim['game']): void {
    const c = ARCADE_INK[game];
    if (!this.painted) {
      g.fillStyle(0xffffff, 0.5);
      for (const s of this.stars) g.fillCircle(s.x, s.y, s.r);
    }
    this.neon(g, c.glow, () => g.strokeRoundedRect(4, 4, FIELD_W - 8, FIELD_H - 8, 18), 3);
  }

  /** Hoot & Hop in its painting: each vehicle in its lane, facing the way the lane goes. */
  private paintHop(sim: HopGame): void {
    const vehicles = this.vehicles;
    if (!vehicles) return;
    sim.lanes.forEach((lane, i) => {
      const y = rowY(i + 1);
      for (const v of lane.vehicles) {
        vehicles
          .for(v)
          .setPosition(v.x, y)
          .setFlipX(lane.dir < 0)
          .setVisible(v.x + v.w / 2 >= -10 && v.x - v.w / 2 <= FIELD_W + 10);
      }
    });
    vehicles.sweep();
  }

  /** Moon Flap in its painting: each branch's two halves at its gap, and the ground going by under the flight. */
  private paintFlap(sim: FlapGame): void {
    const tops = this.branchTops;
    const feet = this.branchFeet;
    if (!tops || !feet) return;
    for (const b of sim.branches) {
      const { left, topY, bottomY } = branchHalves(b.x, b.gapY, b.gap);
      tops.for(b).setPosition(left, topY);
      feet.for(b).setPosition(left, bottomY);
    }
    tops.sweep();
    feet.sweep();
    // The ground goes by as fast as the branches standing on it.
    const tiles = groundTiles((sim.time / 1000) * FLAP_SPEED);
    this.ground.forEach((tile, i) => {
      const t = tiles[i];
      tile.setVisible(Boolean(t));
      if (t) tile.setPosition(t.x, FLAP_GROUND).setFlipX(t.flip);
    });
  }

  /** Nest Knockdown in its painting: the stack's stands, each cut in nine to its size, and its crates as they stand or fly. */
  private paintKnock(sim: KnockGame): void {
    const crates = this.crates;
    const layers = this.layers;
    if (!crates || !layers) return;
    if (sim.stands !== this.standsShown) {
      for (const image of this.standImages) image.destroy();
      this.standImages = sim.stands.flatMap((st) =>
        standPieces({ x: st.x1, y: st.y, w: st.x2 - st.x1, h: KNOCK_GROUND - st.y }).map(({ dst }, i) =>
          this.add.image(dst.x, dst.y, 'arcade-knock-stand', `nine-${i}`).setOrigin(0).setDisplaySize(dst.w, dst.h),
        ),
      );
      layers.moving.add(this.standImages);
      this.standsShown = sim.stands;
    }
    for (const crate of sim.crates) {
      if (crate.gone) continue;
      crates
        .for(crate)
        .setPosition(crate.x + CRATE / 2, crate.y + CRATE / 2)
        .setRotation(crate.angle);
    }
    crates.sweep();
  }

  private drawHop(g: Phaser.GameObjects.Graphics, sim: HopGame): void {
    const c = ARCADE_INK.crossing;
    // The two kerbs, and the lane markings between them.
    for (const row of [0, HOP_ROWS - 1]) this.neon(g, c.ink, () => g.strokeRect(16, rowY(row) - 30, FIELD_W - 32, 60));
    for (let row = 1; row < HOP_ROWS - 1; row++) {
      const y = rowY(row) + 40;
      if (row === HOP_ROWS - 2) continue;
      g.lineStyle(2, c.ink, 0.35);
      for (let x = 16; x < FIELD_W - 16; x += 36) g.lineBetween(x, y, x + 18, y);
    }
    sim.lanes.forEach((lane, i) => {
      const y = rowY(i + 1);
      for (const v of lane.vehicles) {
        if (v.x + v.w / 2 < -10 || v.x - v.w / 2 > FIELD_W + 10) continue;
        if (v.kind === 'drone') {
          // A drone: a body, four rotors and a light that blinks.
          this.neon(g, 0x8af4ff, () => {
            g.strokeCircle(v.x, y, 10);
            for (const dx of [-16, 16]) for (const dy of [-12, 12]) g.strokeCircle(v.x + dx, y + dy, 6);
          });
          if (Math.floor(sim.time / 300 + v.x) % 2 === 0) g.fillStyle(0xff2aa1, 1).fillCircle(v.x, y, 3);
        } else {
          // A noodle cart: its box, two wheels, and a steaming bowl on top.
          this.neon(g, AMBER, () => {
            g.strokeRoundedRect(v.x - v.w / 2, y - 18, v.w, 30, 6);
            g.strokeCircle(v.x - v.w / 3, y + 16, 7);
            g.strokeCircle(v.x + v.w / 3, y + 16, 7);
            g.beginPath();
            g.arc(v.x, y - 18, 12, 0, Math.PI, false);
            g.strokePath();
          });
          g.lineStyle(2, 0xffffff, 0.45);
          for (const dx of [-5, 4]) g.lineBetween(v.x + dx, y - 34, v.x + dx + 3 * Math.sin(sim.time / 200 + dx), y - 44);
        }
      }
    });
  }

  /** The hopping owl, mid-hop on an arc between rows. */
  private placeHopOwl(sim: HopGame): void {
    const from = rowY(sim.row);
    const to = sim.hop ? rowY(sim.hop.to) : from;
    const t = sim.hop?.t ?? 0;
    const y = from + (to - from) * t - Math.sin(Math.PI * t) * 18;
    this.placeOwl(HOP_X, y + 22, 0, sim.heading === 1 ? 1 : -1);
  }

  private drawFlap(g: Phaser.GameObjects.Graphics, sim: FlapGame): void {
    const c = ARCADE_INK.flight;
    // The moon, and the ground glowing below.
    this.neon(g, 0xf6f1e3, () => g.strokeCircle(380, 96, 34), 2);
    this.neon(g, c.ink, () => g.lineBetween(12, FLAP_GROUND, FIELD_W - 12, FLAP_GROUND), 3);
    const drift = (sim.time / 1000) * 60;
    g.lineStyle(2, c.ink, 0.25);
    for (let x = -((drift % 40) + 40); x < FIELD_W; x += 40) g.lineBetween(x, FLAP_GROUND + 6, x - 30, FIELD_H - 10);
    for (const b of sim.branches) {
      if (b.x < -BRANCH_W || b.x > FIELD_W + BRANCH_W) continue;
      const top = b.gapY - b.gap / 2;
      const bottom = b.gapY + b.gap / 2;
      this.neon(g, c.glow, () => {
        g.strokeRoundedRect(b.x - BRANCH_W / 2, -20, BRANCH_W, top + 20, 10);
        g.strokeRoundedRect(b.x - BRANCH_W / 2, bottom, BRANCH_W, FLAP_GROUND - bottom, 10);
        // A twig off each half.
        g.lineBetween(b.x - BRANCH_W / 2, top - 30, b.x - BRANCH_W / 2 - 16, top - 46);
        g.lineBetween(b.x + BRANCH_W / 2, bottom + 34, b.x + BRANCH_W / 2 + 14, bottom + 52);
      });
    }
  }

  /** The flying owl, leaning into its climb or its fall. */
  private placeFlapOwl(sim: FlapGame): void {
    const tilt = Math.max(-0.5, Math.min(0.7, sim.vy / 700));
    this.placeOwl(FLAP_X, sim.y + FLAP_R + 6, tilt, 1);
  }

  /** Nest Knockdown in neon, or over its painting just the band pulled back and the path it will fly; and the owl. */
  private drawKnock(g: Phaser.GameObjects.Graphics, sim: KnockGame): void {
    const c = ARCADE_INK.sling;
    if (!this.painted) {
      this.neon(g, c.ink, () => g.lineBetween(12, KNOCK_GROUND, FIELD_W - 12, KNOCK_GROUND), 3);
      // The slingshot's fork.
      this.neon(g, AMBER, () => {
        g.lineBetween(SLING.x, KNOCK_GROUND, SLING.x, SLING.y + 34);
        g.lineBetween(SLING.x, SLING.y + 34, SLING.x - 22, SLING.y - 6);
        g.lineBetween(SLING.x, SLING.y + 34, SLING.x + 22, SLING.y - 6);
      });
    }
    const aiming = sim.phase === 'aim';
    const pull = aiming ? { x: -Math.cos((sim.angle * Math.PI) / 180) * sim.power * 40, y: Math.sin((sim.angle * Math.PI) / 180) * sim.power * 40 } : { x: 0, y: 0 };
    const pocket = { x: SLING.x + pull.x, y: SLING.y + pull.y };
    if (aiming) {
      g.lineStyle(2, AMBER, 0.9);
      g.lineBetween(SLING.x - 22, SLING.y - 6, pocket.x, pocket.y);
      g.lineBetween(SLING.x + 22, SLING.y - 6, pocket.x, pocket.y);
      g.fillStyle(0xffffff, 0.8);
      for (const p of sim.path()) g.fillCircle(p.x, p.y, 2.5);
    }
    for (const s of this.painted ? [] : sim.stands) this.neon(g, c.glow, () => g.strokeRect(s.x1, s.y, s.x2 - s.x1, KNOCK_GROUND - s.y));
    for (const crate of this.painted ? [] : sim.crates) {
      if (crate.gone) continue;
      const cx = crate.x + CRATE / 2;
      const cy = crate.y + CRATE / 2;
      const a = crate.angle;
      const corner = (dx: number, dy: number) => ({ x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) });
      const h = CRATE / 2 - 1;
      const pts = [corner(-h, -h), corner(h, -h), corner(h, h), corner(-h, h)];
      this.neon(g, crate.knocked ? 0xff8ad0 : AMBER, () => {
        g.strokePoints(pts, true);
        g.lineBetween(pts[0]!.x, pts[0]!.y, pts[2]!.x, pts[2]!.y);
      });
    }
    const o = aiming ? pocket : sim.owl;
    this.placeOwl(o.x, o.y + 16, aiming ? 0 : Math.atan2(sim.owl.vy, sim.owl.vx) * 0.3, 1);
  }

  /** The owl's feet at a point of the field, leaning a little, facing a way. */
  private placeOwl(x: number, y: number, tilt: number, dir: 1 | -1): void {
    const owl = this.owl;
    if (!owl) return;
    owl.pos = { x, y };
    owl.face(dir);
    owl.setRotation(tilt);
  }

  /** The owl drawn at its size in the field (tests check it is the visitor's own). */
  owlLook(): OwlLook | null {
    return this.owl?.look ?? null;
  }
}

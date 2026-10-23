import Phaser from 'phaser';
import type { OwlLook } from '@owl-park/shared';
import type { ParkConfig } from '../config';
import { FIELD_H, FIELD_W, runRandom } from '../arcade/field';
import { BRANCH_W, FLAP_R, FLAP_X, GROUND_Y as FLAP_GROUND, type FlapGame } from '../arcade/flap';
import { HOP_ROWS, HOP_X, rowY, type HopGame } from '../arcade/hop';
import { CRATE, GROUND_Y as KNOCK_GROUND, SLING, type KnockGame } from '../arcade/knock';
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
 * A run of an arcade game drawn over the room (C40): the field in neon line-art, in the cabinet's
 * colours, and the visitor's own owl playing it. The scene steps the game every frame; the HUD's
 * arcade screen around it shows the score and takes the taps and keys. The room keeps running
 * underneath, like the owl builder's preview.
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
  /** Called every frame after the game stepped. */
  private onStep: ((sim: ArcadeSim) => void) | null = null;
  /** A run asked for before the scene had started: it begins once the scene is up. */
  private pending: { sim: ArcadeSim; look: OwlLook; onStep: (sim: ArcadeSim) => void } | null = null;

  constructor() {
    super({ key: 'arcade' });
  }

  create(): void {
    this.backdrop = this.add.rectangle(FIELD_W / 2, FIELD_H / 2, 10, 10, NIGHT).setDepth(-10);
    this.frameG = this.add.graphics().setDepth(0).setBlendMode(Phaser.BlendModes.ADD);
    this.g = this.add.graphics().setDepth(1).setBlendMode(Phaser.BlendModes.ADD);
    // Traffic, branches and crates come and go at the field's edges, never beyond its frame.
    const field = this.make.graphics({}, false).fillStyle(0xffffff).fillRoundedRect(8, 8, FIELD_W - 16, FIELD_H - 16, 14);
    this.g.setMask(field.createGeometryMask());
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
    const rnd = runRandom(7);
    this.stars = Array.from({ length: 40 }, () => ({ x: rnd() * FIELD_W, y: rnd() * (FIELD_H - 120), r: 0.6 + rnd() * 1.4 }));
    this.owl?.destroy();
    this.owl = new Owl(this, 'arcade', playingLook(look), { x: 0, y: 0 }, 2);
    this.owl.setScale(this.owl.scaleX * OWL_IN_FIELD).setDepth(5);
    this.owl.showShadow(sim.game !== 'flight');
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
    sim.advance(delta);
    g.clear();
    this.frameG.clear();
    this.frameLines(this.frameG, sim.game);
    if (sim.game === 'crossing') this.drawHop(g, sim);
    else if (sim.game === 'flight') this.drawFlap(g, sim);
    else this.drawKnock(g, sim);
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

  private frameLines(g: Phaser.GameObjects.Graphics, game: ArcadeSim['game']): void {
    const c = ARCADE_INK[game];
    g.fillStyle(0xffffff, 0.5);
    for (const s of this.stars) g.fillCircle(s.x, s.y, s.r);
    this.neon(g, c.glow, () => g.strokeRoundedRect(4, 4, FIELD_W - 8, FIELD_H - 8, 18), 3);
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
    // The owl, mid-hop on an arc between rows.
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
    const tilt = Math.max(-0.5, Math.min(0.7, sim.vy / 700));
    this.placeOwl(FLAP_X, sim.y + FLAP_R + 6, tilt, 1);
  }

  private drawKnock(g: Phaser.GameObjects.Graphics, sim: KnockGame): void {
    const c = ARCADE_INK.sling;
    this.neon(g, c.ink, () => g.lineBetween(12, KNOCK_GROUND, FIELD_W - 12, KNOCK_GROUND), 3);
    // The slingshot: its fork, and its band pulled back while aiming.
    this.neon(g, AMBER, () => {
      g.lineBetween(SLING.x, KNOCK_GROUND, SLING.x, SLING.y + 34);
      g.lineBetween(SLING.x, SLING.y + 34, SLING.x - 22, SLING.y - 6);
      g.lineBetween(SLING.x, SLING.y + 34, SLING.x + 22, SLING.y - 6);
    });
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
    for (const s of sim.stands) this.neon(g, c.glow, () => g.strokeRect(s.x1, s.y, s.x2 - s.x1, KNOCK_GROUND - s.y));
    for (const crate of sim.crates) {
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

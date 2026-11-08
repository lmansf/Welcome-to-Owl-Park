import Phaser from 'phaser';
import {
  BAND_COUNT,
  CLIMB_CAMERA_ANCHOR,
  CLIMB_FIELD_W,
  FRAIL_MS,
  LANTERN_R,
  MOTH_R,
  OWL_H as CLIMB_OWL_H,
  bandLine,
  lanternBob,
  mothAt,
  platforms,
  startState,
  stepClimb,
  type ClimbInput,
  type ClimbState,
  type Layout,
  type Ledge,
  type Night,
  type OwlLook,
} from '@owl-park/shared';
import { StepClock } from '../arcade/field';
import type { ParkConfig } from '../config';
import { ART, CLIMB_ART_KEYS, loadArt, releaseArt } from './art';
import type { PreviewRect } from './BuilderScene';
import { Owl } from './Owl';

/** The field shows at least this much of the tower at once (field pixels), whatever the screen's shape. */
const VIEW_H_MIN = 640;
/** The owl's size in the rooms, before the field shrinks it to its collision box. */
const ROOM_OWL_H = 120;
const GLASS = 0x9fd0ff;
/** The high road's ledges are tinted lilac, so a climber can tell the two roads apart at a glance. */
const HIGH_ROAD = 0xcdb0ff;
/** Frail glass is tinted amber: it looks thin, and it is. */
const FRAIL = 0xffc98a;
const LANTERN_GOLD = 0xffd36a;
const CHAIN = 0x2a3b63;
const LEAD = 0x1a2340;
const THORN = 0xff8ad0;
const MOTH = 0x7be0c8;
const NIGHT_SKY = 0x0b1630;
/** A crumbled ledge is gone from view this long, then fades back. */
const CRUMBLE_GONE_MS = 900;
/** The world holds still this long when a pane cracks: the hit lands. */
const HIT_STOP_MS = 70;
/** Where each painted piece's standing surface lies, in logical px from its top edge (lanterns and clouds rise above it). */
const SURFACE: Readonly<Record<string, number>> = { 'climb-ledge-a': 11, 'climb-ledge-b': 11, 'climb-balcony': 36, 'climb-cloud-cap': 135 };
/** The band's tints, foot to clouds: the tower's glass warms as it rises. */
const BAND_TINTS = [0x1a2d5a, 0x24366b, 0x3a3f78, 0x58437f, 0x7a4f85, 0x9c6a8f];

/** What a climb needs to run. */
export interface ClimbRun {
  layout: Layout;
  night: Night;
  /** The band the run stands on when it opens (0: the foot). */
  banked: number;
  look: OwlLook;
  /** The held controls, read once per step. */
  input(): ClimbInput;
  /** After each frame's steps. */
  onStep(state: ClimbState): void;
  /** Calm motion: the glass does not pulse, the field does not shake. */
  calm: boolean;
}

/** The visitor's own look without its pet or effect: the climb is made by the owl alone. */
function climbingLook(look: OwlLook): OwlLook {
  const wear = look.wear ? { ...look.wear } : undefined;
  if (wear) {
    delete wear.pet;
    delete wear.fx;
  }
  return wear && Object.keys(wear).length ? { ...look, wear } : { body: look.body, belly: look.belly, accent: look.accent, ...(look.species ? { species: look.species } : {}) };
}

/**
 * The stained-glass climb drawn over the room: a portrait field CLIMB_FIELD_W wide, the tower's
 * ledges, walls, balconies and hazards from the layout, the camera following the owl, and the owl
 * itself in its run, jump, dash, cling and talons-down poses. The scene steps the shared simulation
 * (stepClimb) on a fixed clock from the controls the climb screen holds; the handler (game/climb.ts)
 * watches the bands and the panes. The feel lives here: a hit-stop and a jolt when a pane cracks,
 * the shade's fade, dust on a landing, a trail on a dash, a flash on a pogo, a shiver on frail glass.
 */
export class ClimbScene extends Phaser.Scene {
  private run: ClimbRun | null = null;
  private state: ClimbState | null = null;
  private all: readonly Ledge[] = [];
  private owl: Owl | null = null;
  private owlBase = 1;
  private readonly clock = new StepClock();
  private lastStep: number | null = null;
  private rect: PreviewRect = { x: 0, y: 0, w: 1, h: 1 };
  private backdrop: Phaser.GameObjects.Rectangle | null = null;
  private tower: Phaser.GameObjects.Container | null = null;
  private glow: Phaser.GameObjects.Graphics | null = null;
  private pulse: Phaser.Tweens.Tween | null = null;
  private painted = false;
  private pending: ClimbRun | null = null;
  private camY = 0;
  /** The drawn ledges by their data, for the frail ones' shake and fall. */
  private ledgeViews = new Map<Ledge, { view: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics; x: number; y: number }>();
  private moving: Phaser.GameObjects.Graphics | null = null;
  private movingGlow: Phaser.GameObjects.Graphics | null = null;
  private shade: Phaser.GameObjects.Rectangle | null = null;
  private vignette: Phaser.GameObjects.Graphics | null = null;
  private dust: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private freezeUntil = 0;
  private lastWall: 0 | 1 | -1 = 0;

  constructor() {
    super({ key: 'climb' });
  }

  create(): void {
    this.backdrop = this.add.rectangle(CLIMB_FIELD_W / 2, 0, 10, 10, NIGHT_SKY).setDepth(-10);
    this.tower = this.add.container(0, 0).setDepth(0);
    this.glow = this.add.graphics().setDepth(1).setBlendMode(Phaser.BlendModes.ADD);
    this.movingGlow = this.add.graphics().setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
    this.moving = this.add.graphics().setDepth(4);
    this.shade = this.add.rectangle(0, 0, 10, 10, 0x05060d).setDepth(20).setAlpha(0).setScrollFactor(0);
    this.vignette = this.add.graphics().setDepth(19).setScrollFactor(0);
    if (this.textures.exists('fx-dot')) {
      this.dust = this.add.particles(0, 0, 'fx-dot', {
        lifespan: { min: 250, max: 500 },
        speed: { min: 20, max: 90 },
        angle: { min: 200, max: 340 },
        scale: { start: 0.45, end: 0 },
        alpha: { start: 0.7, end: 0 },
        tint: [0xcfe6ff, 0x9fd0ff],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      });
      this.dust.setDepth(6);
      this.sparks = this.add.particles(0, 0, 'fx-dot', {
        lifespan: { min: 300, max: 700 },
        speed: { min: 60, max: 240 },
        scale: { start: 0.55, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [LANTERN_GOLD, 0xfff2c2, 0x9fd0ff, THORN],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      });
      this.sparks.setDepth(6);
    }
    const onResize = () => this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, onResize);
      this.pulse?.destroy();
      this.pulse = null;
      this.owl?.destroy();
      this.owl = null;
      this.run = null;
      this.state = null;
      this.tower = null;
      this.glow = null;
      this.moving = null;
      this.movingGlow = null;
      this.shade = null;
      this.vignette = null;
      this.dust = null;
      this.sparks = null;
      this.ledgeViews.clear();
      this.backdrop = null;
      this.painted = false;
      releaseArt(this, CLIMB_ART_KEYS);
    });
    const cfg = this.registry.get('config') as ParkConfig | undefined;
    void loadArt(this, CLIMB_ART_KEYS, cfg?.pixelRatio ?? 1, cfg?.artScaleMax ?? 1).then(() => {
      // The pieces came after the tower was drawn: draw it again from them.
      if (this.run && this.tower) this.paint(this.run.layout);
    });
    this.layout();
    const p = this.pending;
    this.pending = null;
    if (p) this.play(p);
  }

  /** Play a climb from the band it stands on. */
  play(run: ClimbRun): void {
    if (!this.tower) {
      this.pending = run;
      return;
    }
    this.run = run;
    this.all = platforms(run.layout);
    const s = startState(run.layout, run.night);
    const y = bandLine(run.layout, run.banked);
    this.state = { ...s, y, band: run.banked, bench: run.banked, benchY: y, safeY: y };
    this.lastStep = null;
    this.freezeUntil = 0;
    this.lastWall = 0;
    this.owl?.destroy();
    this.owl = new Owl(this, 'climb', climbingLook(run.look), { x: 0, y: 0 }, 2);
    this.owlBase = this.owl.scaleX * (CLIMB_OWL_H / ROOM_OWL_H);
    this.owl.setScale(this.owlBase).setDepth(5);
    this.owl.showShadow(true);
    this.camY = this.cameraTargetY(y);
    this.paint(run.layout);
    this.pulse?.destroy();
    this.pulse = null;
    if (!run.calm && this.glow) this.pulse = this.tweens.add({ targets: this.glow, alpha: { from: 0.55, to: 1 }, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.shade?.setAlpha(0);
    this.layout();
  }

  /** Whether the tower is drawn from its paintings (tests ask). */
  isPainted(): boolean {
    return this.painted;
  }

  /** The climb as it stands, for tests and the handler. */
  snapshot(): ClimbState | null {
    return this.state ? { ...this.state } : null;
  }

  /** A painted piece at its logical size, or null when its art has not come. */
  private piece(key: string, x: number, y: number, w: number, h: number, originX = 0, originY = 1): Phaser.GameObjects.Image | null {
    if (!this.textures.exists(key)) return null;
    return this.add.image(x, y, key).setOrigin(originX, originY).setDisplaySize(w, h);
  }

  /** The tower from the layout: the sky of each band, the ledges, the walls, the thorns, the balconies and the cloud cap. World y is minus field y. */
  private paint(layout: Layout): void {
    const tower = this.tower;
    const glow = this.glow;
    if (!tower || !glow) return;
    tower.removeAll(true);
    glow.clear();
    this.ledgeViews.clear();
    const bandH = layout.bandLines[0] ?? 1200;
    let painted = true;
    for (let b = 0; b <= BAND_COUNT; b++) {
      const y0 = b * bandH;
      const sky = this.piece('climb-sky', 0, -y0, CLIMB_FIELD_W, bandH);
      if (sky) {
        sky.setTint(BAND_TINTS[Math.min(b, BAND_TINTS.length - 1)]!);
        tower.add(sky);
      } else {
        painted = false;
        const g = this.add.graphics();
        g.fillStyle(BAND_TINTS[Math.min(b, BAND_TINTS.length - 1)]!, 1).fillRect(0, -y0 - bandH, CLIMB_FIELD_W, bandH);
        g.fillStyle(GLASS, 0.07);
        for (let yy = y0 + 40; yy < y0 + bandH; yy += 110) for (let xx = (yy / 110) % 2 ? 20 : 70; xx < CLIMB_FIELD_W - 60; xx += 100) g.fillRoundedRect(xx, -yy - 70, 60, 70, 8);
        tower.add(g);
      }
    }
    // The walls: pillars of leaded glass the owl clings to.
    for (const w of layout.walls) {
      const g = this.add.graphics();
      const left = w.x >= CLIMB_FIELD_W ? w.x - 14 : w.x < 1 ? 0 : w.x - 7;
      g.fillStyle(LEAD, 1).fillRect(left, -w.y1, 14, w.y1 - w.y0);
      g.fillStyle(GLASS, 0.22).fillRect(left + 3, -w.y1 + 6, 8, w.y1 - w.y0 - 12);
      g.lineStyle(1, GLASS, 0.35);
      for (let yy = w.y0 + 40; yy < w.y1; yy += 80) g.lineBetween(left, -yy, left + 14, -yy);
      tower.add(g);
      glow.fillStyle(GLASS, 0.1).fillRect(left - 2, -w.y1, 18, w.y1 - w.y0);
    }
    for (const l of layout.ledges) {
      if (l.bench) continue; // the landings are drawn as balconies below
      const key = l.w >= 240 ? 'climb-ledge-b' : 'climb-ledge-a';
      const h = ART[key]?.h ?? 40;
      const tint = l.frail ? FRAIL : l.road === 'high' ? HIGH_ROAD : GLASS;
      const img = this.piece(key, l.x, -l.y + h - SURFACE[key]!, l.w, h);
      if (img) {
        if (l.road === 'high' || l.frail) img.setTint(tint);
        if (l.frail) img.setAlpha(0.85);
        tower.add(img);
        this.ledgeViews.set(l, { view: img, x: img.x, y: img.y });
      } else {
        painted = false;
        const g = this.add.graphics();
        g.fillStyle(tint, 0.9).fillRoundedRect(l.x, -l.y, l.w, 12, 5);
        g.fillStyle(l.road === 'high' ? 0x4a3f78 : 0x3a5c99, 0.9).fillRoundedRect(l.x + 6, -l.y + 10, l.w - 12, 14, 4);
        tower.add(g);
        this.ledgeViews.set(l, { view: g, x: 0, y: 0 });
      }
      glow.fillStyle(tint, l.road === 'high' ? 0.26 : 0.18).fillRect(l.x, -l.y - 4, l.w, 6);
    }
    // The thorns: beds and ceilings of rose shards.
    for (const th of layout.thorns) {
      const g = this.add.graphics();
      g.fillStyle(0x3a1f4a, 1).fillRect(th.x, -th.y - th.h, th.w, th.h);
      g.fillStyle(THORN, 0.95);
      const up = th.h <= 30;
      const n = Math.max(2, Math.floor(th.w / 14));
      for (let i = 0; i < n; i++) {
        const x0 = th.x + (i * th.w) / n;
        const x1 = th.x + ((i + 1) * th.w) / n;
        const xm = (x0 + x1) / 2;
        if (up) g.fillTriangle(x0, -th.y, x1, -th.y, xm, -th.y - th.h - 6);
        else {
          g.fillTriangle(x0, -th.y - th.h, x1, -th.y - th.h, xm, -th.y + 6);
          g.fillTriangle(x0, -th.y, x1, -th.y, xm, -th.y - th.h - 6);
        }
      }
      tower.add(g);
      glow.fillStyle(THORN, 0.14).fillRect(th.x, -th.y - th.h - 4, th.w, th.h + 8);
    }
    // The benches: the band lines' balconies (the last the cloud cap) and the landings halfway up each storey.
    const benches = [...layout.bandLines.map((y, i) => ({ y, last: i === BAND_COUNT - 1 })), ...layout.ledges.filter((l) => l.bench).map((l) => ({ y: l.y, last: false }))];
    benches.forEach(({ y, last }) => {
      const capKey = last ? 'climb-cloud-cap' : 'climb-balcony';
      const capH = ART[capKey]?.h ?? (last ? 220 : 120);
      const img = this.piece(capKey, 0, -y + capH - SURFACE[capKey]!, CLIMB_FIELD_W, capH);
      if (img) tower.add(img);
      else {
        painted = false;
        const g = this.add.graphics();
        if (last) {
          g.fillStyle(0xf6f1e3, 0.92).fillRoundedRect(-20, -y - 30, CLIMB_FIELD_W + 40, 60, 30);
          g.fillStyle(0xffffff, 0.8).fillCircle(90, -y - 50, 60).fillCircle(240, -y - 70, 80).fillCircle(400, -y - 45, 55);
        } else {
          g.fillStyle(0xffd36a, 0.95).fillRect(0, -y, CLIMB_FIELD_W, 10);
          g.fillStyle(0x6b4a2b, 0.95).fillRect(0, -y + 10, CLIMB_FIELD_W, 30);
          g.fillStyle(0xffd36a, 0.5);
          for (let xx = 12; xx < CLIMB_FIELD_W; xx += 40) g.fillRect(xx, -y + 10, 6, 30);
        }
        tower.add(g);
      }
      // The bench: a pool of warm light where the shade returns the owl and the panes relight.
      glow.fillStyle(last ? 0xffffff : 0xffd36a, 0.14).fillRect(0, -y - 6, CLIMB_FIELD_W, 8);
      if (!last) glow.fillStyle(LANTERN_GOLD, 0.16).fillEllipse(CLIMB_FIELD_W / 2, -y - 2, 150, 18);
    });
    // The start ledge: the foot of the tower.
    const foot = this.add.graphics();
    foot.fillStyle(0x2a3b63, 1).fillRect(-40, 0, CLIMB_FIELD_W + 80, 200);
    foot.fillStyle(GLASS, 0.6).fillRect(0, -2, CLIMB_FIELD_W, 4);
    tower.add(foot);
    this.painted = painted && this.textures.exists('climb-cloud-cap');
  }

  /** The lanterns on their chains, the moths on their tracks, and the frail glass under the owl, where the clock has them. */
  private drawMoving(layout: Layout, night: Night, s: ClimbState): void {
    const g = this.moving;
    const glow = this.movingGlow;
    if (g && glow) {
      g.clear();
      glow.clear();
      for (const l of layout.lanterns) {
        const b = lanternBob(l, s.t, night.pace);
        g.lineStyle(2, CHAIN, 1).lineBetween(l.x, -l.y, b.x, -b.y);
        g.fillStyle(CHAIN, 1).fillRoundedRect(l.x - 8, -l.y - 3, 16, 6, 2);
        // A glass lantern: a dark cap and foot, gold panes between lead lines, a warm glow around it.
        g.fillStyle(CHAIN, 1).fillRoundedRect(b.x - 9, -b.y - LANTERN_R - 2, 18, 6, 2).fillRoundedRect(b.x - 7, -b.y + LANTERN_R - 5, 14, 5, 2);
        g.fillStyle(LANTERN_GOLD, 0.95).fillRoundedRect(b.x - 12, -b.y - LANTERN_R + 3, 24, LANTERN_R * 2 - 7, 6);
        g.lineStyle(1.5, CHAIN, 0.9).strokeRoundedRect(b.x - 12, -b.y - LANTERN_R + 3, 24, LANTERN_R * 2 - 7, 6).lineBetween(b.x, -b.y - LANTERN_R + 3, b.x, -b.y + LANTERN_R - 4);
        g.fillStyle(0xfff2c2, 0.95).fillCircle(b.x, -b.y, 5);
        glow.fillStyle(LANTERN_GOLD, 0.22).fillCircle(b.x, -b.y, LANTERN_R + 12);
      }
      for (const m of layout.moths) {
        const p = mothAt(m, s.t, night.pace);
        const flap = Math.sin(s.t / 45) * 0.5 + 0.5;
        // A glass moth: a slim body, two wings of mint glass beating, a trail of light on its track.
        glow.fillStyle(MOTH, 0.2).fillCircle(p.x, -p.y, MOTH_R + 10);
        glow.fillStyle(MOTH, 0.12).fillEllipse(p.x - p.dir * 18, -p.y, 30, 8);
        g.fillStyle(MOTH, 0.9).fillEllipse(p.x - p.dir * 2, -p.y - 2 - 6 * flap, 26, 10 + 6 * flap);
        g.fillStyle(0xd8fff4, 0.95).fillEllipse(p.x, -p.y, 10, 16);
        g.lineStyle(1, LEAD, 0.8).strokeEllipse(p.x - p.dir * 2, -p.y - 2 - 6 * flap, 26, 10 + 6 * flap);
        g.fillStyle(LEAD, 1).fillCircle(p.x + p.dir * 3, -p.y - 5, 1.6);
      }
    }
    // Frail glass shivers under the owl as its time runs out; it falls away when it gives, then returns.
    for (const [l, v] of this.ledgeViews) {
      if (!l.frail) continue;
      const under = s.grounded && Math.abs(s.y - l.y) < 0.5 && s.x - 18 < l.x + l.w && s.x + 18 > l.x;
      const k = under ? Math.min(1, s.stoodMs / FRAIL_MS) : 0;
      v.view.setPosition(v.x + (k > 0 ? Math.sin(s.t / 18) * 4 * k : 0), v.y);
    }
    if (s.crumbled) {
      const v = this.ledgeViews.get(s.crumbled);
      if (v) {
        this.tweens.killTweensOf(v.view);
        v.view.setPosition(v.x, v.y);
        this.tweens.add({ targets: v.view, alpha: 0, y: v.y + 14, duration: 160, ease: 'Quad.easeIn' });
        this.time.delayedCall(CRUMBLE_GONE_MS, () => {
          if (!v.view.scene) return;
          this.tweens.add({ targets: v.view, alpha: 0.85, y: v.y, duration: 350, ease: 'Sine.easeOut' });
        });
      }
    }
  }

  /** The feel: what each event of the step looks like. */
  private react(s: ClimbState, run: ClimbRun, now: number): void {
    const x = s.x;
    const feet = -s.y;
    const shake = (ms: number, k: number) => {
      if (!run.calm) this.cameras.main.shake(ms, k);
    };
    switch (s.event) {
      case 'land':
        this.dust?.explode(8, x, feet);
        break;
      case 'jump':
      case 'double':
        this.dust?.explode(s.event === 'double' ? 10 : 5, x, feet);
        break;
      case 'kick':
        this.dust?.explode(8, x + (s.vx > 0 ? -16 : 16), feet - 20);
        break;
      case 'dash':
        this.dust?.explode(12, x - s.facing * 20, feet - 20);
        break;
      case 'pogo':
        this.sparks?.explode(14, x, feet);
        shake(60, 0.002);
        break;
      case 'hit':
      case 'thorns':
        this.freezeUntil = now + HIT_STOP_MS;
        this.sparks?.explode(22, x, feet - CLIMB_OWL_H / 2);
        shake(180, 0.006);
        if (this.shade && s.event === 'thorns' && !run.calm) this.tweens.add({ targets: this.shade, alpha: { from: 0.7, to: 0 }, duration: 260, ease: 'Quad.easeOut' });
        break;
      case 'shade':
        this.sparks?.explode(30, x, feet - CLIMB_OWL_H / 2);
        shake(260, 0.005);
        if (this.shade) this.tweens.add({ targets: this.shade, alpha: 0.92, duration: 500, ease: 'Sine.easeIn' });
        break;
      case 'respawn':
        if (this.shade) this.tweens.add({ targets: this.shade, alpha: 0, duration: 450, ease: 'Sine.easeOut' });
        this.sparks?.explode(16, x, feet - CLIMB_OWL_H / 2);
        break;
      case 'rest':
        this.sparks?.explode(18, x, feet - CLIMB_OWL_H / 2);
        break;
      default:
        break;
    }
    // Sliding down a wall scrapes a little glass dust.
    if (s.wall !== 0 && this.lastWall === 0) this.dust?.explode(4, x + s.wall * 16, feet - 10);
    this.lastWall = s.wall;
  }

  /** Where the HUD leaves room for the field (CSS pixels). */
  frame(rect: PreviewRect): void {
    this.rect = rect;
    if (this.tower) this.layout();
  }

  private zoom(): number {
    const k = (this.registry.get('config') as ParkConfig | undefined)?.pixelRatio ?? 1;
    const r = this.rect;
    return Math.max(0.1, Math.min((r.w * k) / CLIMB_FIELD_W, (r.h * k) / VIEW_H_MIN));
  }

  /** The camera's centre (world y) that puts the owl at the anchor, never looking under the foot. */
  private cameraTargetY(fieldY: number): number {
    const { height } = this.scale.gameSize;
    const k = (this.registry.get('config') as ParkConfig | undefined)?.pixelRatio ?? 1;
    const zoom = this.zoom();
    const viewH = (this.rect.h * k) / zoom;
    const centreOffset = (height / 2 - (this.rect.y + this.rect.h / 2) * k) / zoom;
    const owlY = -fieldY;
    const target = owlY - viewH * (0.5 - CLIMB_CAMERA_ANCHOR) + centreOffset;
    const lowest = -(viewH / 2) + 60 + centreOffset;
    return Math.min(target, lowest);
  }

  private layout(): void {
    const cam = this.cameras.main;
    const { width, height } = this.scale.gameSize;
    cam.setViewport(0, 0, width, height);
    const k = (this.registry.get('config') as ParkConfig | undefined)?.pixelRatio ?? 1;
    const zoom = this.zoom();
    cam.setZoom(zoom);
    const r = this.rect;
    const x = CLIMB_FIELD_W / 2 + (width / 2 - (r.x + r.w / 2) * k) / zoom;
    cam.centerOn(x, this.camY);
    this.backdrop?.setPosition(x, this.camY).setSize(width / zoom + 64, height / zoom + 64);
    // The shade and the vignette cover the screen whatever the zoom.
    this.shade?.setPosition(width / 2, height / 2).setSize(width / zoom + 64, height / zoom + 64).setScale(1 / zoom);
    if (this.vignette) {
      const g = this.vignette;
      g.clear();
      const w = width;
      const h = height;
      const edge = Math.min(w, h) * 0.22;
      g.fillGradientStyle(0x05060d, 0x05060d, 0x05060d, 0x05060d, 0.55, 0.55, 0, 0).fillRect(0, 0, w, edge);
      g.fillGradientStyle(0x05060d, 0x05060d, 0x05060d, 0x05060d, 0, 0, 0.6, 0.6).fillRect(0, h - edge, w, edge);
      g.setScale(1 / zoom).setPosition(0, 0);
    }
  }

  override update(_time: number, delta: number): void {
    const run = this.run;
    if (!run || !this.state) return;
    const now = performance.now();
    if (now < this.freezeUntil) {
      // The hit-stop: the world holds still; the clock does not catch up afterwards.
      this.lastStep = now;
      return;
    }
    let event: ClimbState['event'] = null;
    const panesBefore = this.state.panes;
    this.clock.advance(this.lastStep === null ? delta : now - this.lastStep, () => {
      this.state = stepClimb(this.state!, run.input(), run.layout, run.night, this.all);
      if (this.state.event) event = this.state.event;
      if (this.state.crumbled) this.drawMoving(run.layout, run.night, this.state);
      return true;
    });
    this.lastStep = now;
    const s = this.state;
    if (event) this.react({ ...s, event }, run, now);
    void panesBefore;
    const owl = this.owl;
    if (owl) {
      owl.pos = { x: s.x, y: -s.y };
      if (s.wall !== 0) owl.face(s.wall === 1 ? -1 : 1);
      else if (Math.abs(s.vx) > 20) owl.face(s.vx > 0 ? 1 : -1);
      // The poses: long in a dash, stretched while rising, flat and talons down when striking, a little squashed on a landing, pressed to a wall.
      const down = !s.grounded && run.input !== undefined && s.vy <= 0 && s.wall === 0 && s.dashMs === 0 && this.talonsDown(run);
      const sx = s.dashMs > 0 ? 1.3 : down ? 1.12 : s.rising ? 0.92 : s.wall !== 0 ? 0.9 : 1;
      const sy = s.dashMs > 0 ? 0.78 : down ? 0.86 : s.rising ? 1.08 : s.wall !== 0 ? 1.06 : s.grounded ? 1 : 1.02;
      owl.setScale(this.owlBase * sx, this.owlBase * sy);
      owl.showShadow(s.grounded);
      // Untouchable after a crack: the owl flickers. In the shade: gone.
      owl.setAlpha(s.shadeMs > 0 ? Math.max(0, s.shadeMs / 900 - 0.2) : s.hurtMs > 0 ? (Math.floor(s.hurtMs / 70) % 2 ? 0.35 : 1) : 1);
      owl.tick(Date.now());
      // The owl's own tick sorts it by its y, as the rooms do; here it stays in front of the tower.
      owl.setDepth(5);
    }
    this.drawMoving(run.layout, run.night, s);
    // The camera follows the owl up, settling at the anchor, looking a little ahead of a rise; it drops back when the owl falls.
    const lead = s.vy > 300 ? 40 : 0;
    const target = this.cameraTargetY(s.y + lead);
    this.camY += (target - this.camY) * Math.min(1, delta / 160);
    this.layout();
    run.onStep(s);
  }

  /** Whether the talons-down control is held right now (the pose shows it before a hazard is met). */
  private talonsDown(run: ClimbRun): boolean {
    void run;
    return this.lastDown;
  }

  private lastDown = false;

  /** The handler tells the scene what the controls hold, for the pose (the simulation reads them itself). */
  held(input: ClimbInput): void {
    this.lastDown = input.down;
  }
}

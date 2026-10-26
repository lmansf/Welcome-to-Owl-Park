import Phaser from 'phaser';
import {
  BAND_COUNT,
  CLIMB_CAMERA_ANCHOR,
  CLIMB_FIELD_W,
  OWL_H as CLIMB_OWL_H,
  bandLine,
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
const NIGHT_SKY = 0x0b1630;
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
  /** Calm motion: the glass does not pulse. */
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
 * ledges and balconies from the layout, the camera following the owl, and the owl itself in its
 * run, jump and spread poses. The scene steps the shared simulation (stepClimb) on a fixed clock
 * from the controls the climb screen holds; the handler (game/climb.ts) watches the bands.
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

  constructor() {
    super({ key: 'climb' });
  }

  create(): void {
    this.backdrop = this.add.rectangle(CLIMB_FIELD_W / 2, 0, 10, 10, NIGHT_SKY).setDepth(-10);
    this.tower = this.add.container(0, 0).setDepth(0);
    this.glow = this.add.graphics().setDepth(1).setBlendMode(Phaser.BlendModes.ADD);
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
    const s = startState(run.layout);
    const y = bandLine(run.layout, run.banked);
    this.state = { ...s, y, band: run.banked };
    this.lastStep = null;
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

  /** The tower from the layout: the sky of each band, the ledges, the balconies and the cloud cap. World y is minus field y. */
  private paint(layout: Layout): void {
    const tower = this.tower;
    const glow = this.glow;
    if (!tower || !glow) return;
    tower.removeAll(true);
    glow.clear();
    const bandH = layout.bandLines[0] ?? 900;
    let painted = true;
    const top = layout.bandLines[BAND_COUNT - 1] ?? bandH * BAND_COUNT;
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
        // Mosaic panes: a loose grid of lighter glass.
        g.fillStyle(GLASS, 0.07);
        for (let yy = y0 + 40; yy < y0 + bandH; yy += 110) for (let xx = (yy / 110) % 2 ? 20 : 70 ; xx < CLIMB_FIELD_W - 60; xx += 100) g.fillRoundedRect(xx, -yy - 70, 60, 70, 8);
        tower.add(g);
      }
    }
    for (const l of layout.ledges) {
      const key = l.w >= 240 ? 'climb-ledge-b' : 'climb-ledge-a';
      const h = ART[key]?.h ?? 40;
      const tint = l.road === 'high' ? HIGH_ROAD : GLASS;
      // The piece's standing surface sits SURFACE px under its top edge: that row goes on the ledge's line.
      const img = this.piece(key, l.x, -l.y + h - SURFACE[key]!, l.w, h);
      if (img) {
        if (l.road === 'high') img.setTint(HIGH_ROAD);
        tower.add(img);
      } else {
        painted = false;
        const g = this.add.graphics();
        g.fillStyle(tint, 0.9).fillRoundedRect(l.x, -l.y, l.w, 12, 5);
        g.fillStyle(l.road === 'high' ? 0x4a3f78 : 0x3a5c99, 0.9).fillRoundedRect(l.x + 6, -l.y + 10, l.w - 12, 14, 4);
        tower.add(g);
      }
      glow.fillStyle(tint, l.road === 'high' ? 0.26 : 0.18).fillRect(l.x, -l.y - 4, l.w, 6);
    }
    layout.bandLines.forEach((y, i) => {
      const last = i === BAND_COUNT - 1;
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
      glow.fillStyle(last ? 0xffffff : 0xffd36a, 0.14).fillRect(0, -y - 6, CLIMB_FIELD_W, 8);
    });
    // The start ledge: the foot of the tower.
    const foot = this.add.graphics();
    foot.fillStyle(0x2a3b63, 1).fillRect(-40, 0, CLIMB_FIELD_W + 80, 200);
    foot.fillStyle(GLASS, 0.6).fillRect(0, -2, CLIMB_FIELD_W, 4);
    tower.add(foot);
    this.painted = painted && this.textures.exists('climb-cloud-cap');
    void top;
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
    const shown = height / zoom;
    // The owl at CLIMB_CAMERA_ANCHOR of the field's height from its top; the field sits inside the canvas.
    const centreOffset = (height / 2 - (this.rect.y + this.rect.h / 2) * k) / zoom;
    const owlY = -fieldY;
    const target = owlY - viewH * (0.5 - CLIMB_CAMERA_ANCHOR) + centreOffset;
    const lowest = -(viewH / 2) + 60 + centreOffset;
    void shown;
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
  }

  override update(_time: number, delta: number): void {
    const run = this.run;
    if (!run || !this.state) return;
    const now = performance.now();
    this.clock.advance(this.lastStep === null ? delta : now - this.lastStep, () => {
      this.state = stepClimb(this.state!, run.input(), run.layout, run.night, this.all);
      return true;
    });
    this.lastStep = now;
    const s = this.state;
    const owl = this.owl;
    if (owl) {
      owl.pos = { x: s.x, y: -s.y };
      if (Math.abs(s.vx) > 20) owl.face(s.vx > 0 ? 1 : -1);
      // The poses: stretched while rising, spread while gliding, a little squashed on landing speed.
      const sx = s.gliding ? 1.18 : s.rising ? 0.92 : 1;
      const sy = s.gliding ? 0.9 : s.rising ? 1.08 : s.grounded ? 1 : 1.02;
      owl.setScale(this.owlBase * sx, this.owlBase * sy);
      owl.showShadow(s.grounded);
      owl.tick(Date.now());
      // The owl's own tick sorts it by its y, as the rooms do; here it stays in front of the tower.
      owl.setDepth(5);
    }
    // The camera follows the owl up, settling at the anchor; it drops back when the owl glides down.
    const target = this.cameraTargetY(s.y);
    this.camY += (target - this.camY) * Math.min(1, delta / 160);
    this.layout();
    run.onStep(s);
  }
}

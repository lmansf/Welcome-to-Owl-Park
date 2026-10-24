import Phaser from 'phaser';
import type { OwlLook } from '@owl-park/shared';
import type { ParkConfig } from '../config';
import { ensureFxTextures } from './ambience';
import { Owl } from './Owl';

/** Where the owl builder leaves room for the owl, in CSS pixels. */
export interface PreviewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the preview keeps in view around the owl's feet: a tall hat above, the pet trotting behind. */
const VIEW = { left: -112, right: 92, top: -196, bottom: 26 };
/** Device pixels per room pixel at most: past this the owl's 2x layers would blur. */
const MAX_ZOOM = 5;

/**
 * The owl builder's preview: the visitor's own owl drawn big over a plain dusk backdrop, breathing
 * and blinking, wearing what it wears, its pet beside it and its effect around it. It follows the
 * look as the builder changes it (the game registry's `look`). It covers the room, which keeps
 * running underneath; the builder's panel is drawn over it by the HUD. The home screen (OP-065)
 * draws the same owl beside its buttons, without the backdrop, over the lobby's painting.
 */
export class BuilderScene extends Phaser.Scene {
  private owl: Owl | null = null;
  private rect: PreviewRect = { x: 0, y: 0, w: 1, h: 1 };
  private backdrop: Phaser.GameObjects.Rectangle | null = null;
  /** Whether the plain dusk backdrop fills the screen (the builder), or the scene beneath shows (the home screen). */
  private plain = true;

  constructor() {
    super({ key: 'builder' });
  }

  create(): void {
    // The glow and the owl's effects are drawn with the park's own textures; on the home screen no room has made them yet.
    ensureFxTextures(this);
    this.backdrop = this.add.rectangle(0, 0, 10, 10, 0x0c1e36).setDepth(-10);
    this.add.image(-10, -70, 'fx-glow').setTint(0xffd36a).setAlpha(0.16).setScale(1.6, 1.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(-5);
    this.add.ellipse(-10, 6, 236, 44, 0xf6f1e3, 0.07).setDepth(-4);
    // Worn things are drawn sharper here than in the rooms: the preview is several times bigger.
    this.owl = new Owl(this, 'builder', this.registry.get('look') as OwlLook, { x: 0, y: 0 }, 3);
    const onLook = (_parent: unknown, look: OwlLook) => this.owl?.applyLook(look);
    this.registry.events.on('changedata-look', onLook);
    const onResize = () => this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.registry.events.off('changedata-look', onLook);
      this.scale.off(Phaser.Scale.Events.RESIZE, onResize);
      this.owl?.destroy();
      this.owl = null;
      this.backdrop = null;
    });
    this.layout();
  }

  /** The frame for the owl (the builder opened, or its layout changed); `plain` false lets the scene beneath show around it. */
  frame(rect: PreviewRect, plain = true): void {
    this.rect = rect;
    this.plain = plain;
    if (this.owl) this.layout();
  }

  private layout(): void {
    const cam = this.cameras.main;
    const { width, height } = this.scale.gameSize;
    cam.setViewport(0, 0, width, height);
    const k = (this.registry.get('config') as ParkConfig | undefined)?.pixelRatio ?? 1;
    const r = this.rect;
    const zoom = Math.max(0.1, Math.min((r.w * k) / (VIEW.right - VIEW.left), (r.h * k) / (VIEW.bottom - VIEW.top), MAX_ZOOM));
    cam.setZoom(zoom);
    // The view's middle goes to the frame's middle; the backdrop fills the screen around it.
    const x = (VIEW.left + VIEW.right) / 2 + (width / 2 - (r.x + r.w / 2) * k) / zoom;
    const y = (VIEW.top + VIEW.bottom) / 2 + (height / 2 - (r.y + r.h / 2) * k) / zoom;
    cam.centerOn(x, y);
    this.backdrop?.setPosition(x, y).setSize(width / zoom + 64, height / zoom + 64).setVisible(this.plain);
  }

  override update(): void {
    this.owl?.tick(Date.now());
  }
}

/**
 * A course's tips, drawn (OP-344, courseTips.ts): each a few words in the room at the first of the
 * thing it is about, the same size on any screen, as a doorway's sign is (doorSigns.ts). Only the one
 * nearest the owl shows, fading in as the owl comes near and out as it goes on. The words keep inside
 * the screen, clear of the bars at its top and foot.
 */
import Phaser from 'phaser';
import { tipFor, type CourseTip } from './courseTips';

/** Room pixels per screen pixel now: what keeps a tip the same size on any screen. */
type Scale = () => number;

/** The tip's words on screen, and the widest a line runs before it wraps (CSS px). */
const FONT_PX = 15;
const WRAP_PX = 400;
/** How long a tip takes to fade in or out (ms). */
const FADE_MS = 260;
/** How far the words keep from the screen's top and foot (CSS px): the bars and the objective strip, the Menu and the pad. */
const TOP_PX = 104;
const FOOT_PX = 96;
const SIDE_PX = 12;

export class CourseTipSigns {
  private readonly signs: Array<{ tip: CourseTip; text: Phaser.GameObjects.Text }> = [];
  private scaleNow = 0;
  private focused: string | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly tips: readonly CourseTip[],
    private readonly scale: Scale,
    /** Where the owl is across the room, and how high it is over the ground line. */
    private readonly owl: () => { x: number; z: number },
    depth: number,
  ) {
    for (const tip of tips) {
      const text = scene.add
        .text(tip.at.x, tip.at.y, tip.words, {
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          fontSize: `${FONT_PX * 2}px`,
          fontStyle: 'bold',
          color: '#F6F1E3',
          backgroundColor: 'rgba(12, 30, 54, 0.9)',
          padding: { x: 14, y: 8 },
          align: 'center',
          wordWrap: { width: WRAP_PX * 2 },
          resolution: 2,
        })
        .setOrigin(0.5, 1)
        .setDepth(depth)
        .setAlpha(0);
      this.signs.push({ tip, text });
    }
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.update, this));
  }

  /** The words of the tip showing now, if any (the page's debug state and its tests). */
  shown(): string | null {
    return this.signs.find((s) => s.tip.id === this.focused)?.tip.words ?? null;
  }

  private update(): void {
    const s = this.scale();
    if (s !== this.scaleNow) {
      this.scaleNow = s;
      // Drawn at twice the size and scaled down by half, so the words stay sharp when the camera zooms in.
      for (const { text } of this.signs) text.setScale(s / 2);
    }
    const owl = this.owl();
    const next = tipFor(this.tips, owl.x, owl.z)?.id ?? null;
    if (next !== this.focused) {
      this.focused = next;
      for (const { tip, text } of this.signs) {
        this.scene.tweens.killTweensOf(text);
        this.scene.tweens.add({ targets: text, alpha: tip.id === next ? 1 : 0, duration: FADE_MS, ease: 'Sine.easeOut' });
      }
    }
    const shown = this.signs.find((x) => x.tip.id === this.focused);
    if (!shown) return;
    // Inside the screen, clear of the bars: its words are no use half off an edge.
    const view = this.scene.cameras.main.worldView;
    if (view.width <= 0) return;
    const { text, tip } = shown;
    const halfW = text.displayWidth / 2;
    const left = view.x + SIDE_PX * s + halfW;
    const right = view.right - SIDE_PX * s - halfW;
    text.x = left > right ? view.centerX : Math.min(right, Math.max(left, tip.at.x));
    const top = view.y + TOP_PX * s + text.displayHeight;
    const foot = view.bottom - FOOT_PX * s;
    text.y = top > foot ? foot : Math.min(foot, Math.max(top, tip.at.y));
  }
}

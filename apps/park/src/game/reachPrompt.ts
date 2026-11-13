/**
 * The prompt at the visitor's own owl (OP-344): what it can do where it stands, and on a computer the
 * key that does it. The action row at the foot of the screen says the same, but a new visitor is
 * looking at their owl, not at the corner: the walk found nothing near the owl or the thing that said
 * "press E". One place for every kind of thing (an owl to talk to, a leaf pile, a cabinet, a stall),
 * so it is learnt once. The thing itself keeps its own mark (an owl's '!', a pile's glow).
 *
 * It lies on the floor in front of the owl's feet, where it covers nothing: over the owl's head it
 * lay across the face of whoever stood behind. Where a doorway's sign already lies on that floor
 * (doorSigns.ts), it lies just under the sign.
 */
import Phaser from 'phaser';

/** The key that does the first action where the owl stands, on a computer. */
export const INTERACT_KEY = 'E';

/**
 * The words of the prompt for the first action where the owl stands, or null for none: no action, or
 * one that is not about a thing in reach. A doorway seen from the side has its own arrow over it, and
 * Decorate is offered everywhere in the visitor's own nest.
 */
export function promptWords(action: { id: string; label: string } | undefined, touch: boolean): string | null {
  if (!action || action.id === 'decorate' || action.id.startsWith('door:')) return null;
  return touch ? action.label : `${INTERACT_KEY}: ${action.label}`;
}

/** The prompt's words on screen (CSS px), and how long it takes to come and go (ms). */
const FONT_PX = 13;
const FADE_MS = 160;
/** How far under the owl's feet the prompt lies, and how far under a sign it shares the floor with (CSS px). */
const UNDER_FEET_PX = 10;
const UNDER_SIGN_PX = 6;
/** Half the room a prompt takes across (CSS px): a sign nearer than this across is in its way. */
const HALF_WIDE_PX = 120;

/**
 * Where the middle of the prompt's top goes (room px): just under the owl's feet, or, where a sign lies
 * on the floor there (`sign`, its box), just under the sign. `s` is room pixels per screen pixel.
 */
export function promptPlace(feet: { x: number; y: number }, sign: { left: number; right: number; top: number; bottom: number } | null, s: number): { x: number; y: number } {
  const y = feet.y + UNDER_FEET_PX * s;
  const inWay = sign !== null && sign.right > feet.x - HALF_WIDE_PX * s && sign.left < feet.x + HALF_WIDE_PX * s && sign.bottom > y && sign.top < y + 40 * s;
  return { x: feet.x, y: inWay ? sign.bottom + UNDER_SIGN_PX * s : y };
}

export class ReachPrompt {
  private readonly text: Phaser.GameObjects.Text;
  private words: string | null = null;
  private scaleNow = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    depth: number,
    /** Room pixels per screen pixel now: what keeps the prompt the same size on any screen. */
    private readonly scale: () => number,
    /** Where the middle of the prompt's top goes now (room px): the floor just in front of the owl's feet, or under a sign that lies there. */
    private readonly at: () => { x: number; y: number },
  ) {
    this.text = scene.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: `${FONT_PX * 2}px`,
        fontStyle: 'bold',
        color: '#0C1E36',
        backgroundColor: 'rgba(255, 211, 106, 0.95)',
        padding: { x: 12, y: 6 },
        resolution: 2,
      })
      .setOrigin(0.5, 0)
      .setDepth(depth)
      .setAlpha(0);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.update, this));
  }

  /** Show these words over the owl, or none (null). */
  show(words: string | null): void {
    if (words === this.words) return;
    this.words = words;
    if (words !== null) this.text.setText(words);
    this.scene.tweens.killTweensOf(this.text);
    this.scene.tweens.add({ targets: this.text, alpha: words === null ? 0 : 1, duration: FADE_MS, ease: 'Sine.easeOut' });
  }

  /** The words showing now, if any (the page's debug state and its tests). */
  shown(): string | null {
    return this.words;
  }

  private update(): void {
    const s = this.scale();
    if (s !== this.scaleNow) {
      this.scaleNow = s;
      // Drawn at twice the size and scaled down by half, so the words stay sharp when the camera zooms in.
      this.text.setScale(s / 2);
    }
    if (this.words === null && this.text.alpha === 0) return;
    const at = this.at();
    this.text.setPosition(at.x, at.y);
  }
}

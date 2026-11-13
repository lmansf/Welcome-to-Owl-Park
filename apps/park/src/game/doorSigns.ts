/**
 * The signs naming where a room's doorways lead (DoorDef.label), in a room seen from above: one small
 * board on the floor at each named doorway, the same size on any screen, so an owl standing in the
 * Great Hollow can read which doorway is the Party Grove and which the stair up (Logan, Nov 8: "i
 * can't even find the grove"). Only one shows at a time (OP-309, hints.ts signFocus), fading in as the owl
 * comes near its doorway; the rest wait unseen, each doorway still marked by its own glow. A room seen
 * from the side marks its doorways its own way (treeView).
 */
import Phaser from 'phaser';
import type { RoomDef, WalkMap } from '@owl-park/shared';
import { signDepth, signX, signY, signedDoors } from './hints';

/** Room pixels per screen pixel now: what keeps a sign the same size on any screen. */
type Scale = () => number;

/** The sign's words on screen, in CSS pixels. */
const FONT_PX = 15;

/** How long a sign takes to fade in or out (ms). */
const FADE_MS = 220;


export class DoorSigns {
  private readonly signs: Array<{ text: Phaser.GameObjects.Text; label: string; id: string; at: { x: number; y: number }; anchor: number }> = [];
  private scaleNow = 0;
  private focused: string | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    room: RoomDef,
    private readonly scale: Scale,
    map: WalkMap = 1,
    shut: (roomId: string) => boolean = () => false,
    /** Where the owl's feet are, so the sign showing slides out from under it. */
    private readonly owl: () => { x: number; y: number } = () => ({ x: -1e6, y: -1e6 }),
  ) {
    for (const d of signedDoors(room, map, shut)) {
      const at = (d.labelAt ?? d.marker)!;
      // The part of the sign that stands at its spot: its middle, or the edge beside its doorway (DoorDef.labelAnchor).
      const anchor = d.labelAt ? (d.labelAnchor ?? 0.5) : 0.5;
      const text = scene.add
        .text(at.x, at.y, d.label, {
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          fontSize: `${FONT_PX * 2}px`,
          fontStyle: 'bold',
          color: '#F6F1E3',
          backgroundColor: 'rgba(60, 38, 20, 0.88)',
          padding: { x: 10, y: 5 },
          resolution: 2,
        })
        .setOrigin(anchor, 0)
        // On the floor: an owl walking up to the doorway stands over it, from either side (over the pieces seen from above).
        .setDepth(signDepth(room))
        .setAlpha(0);
      this.signs.push({ text, label: d.label!, id: d.id, at, anchor });
    }
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.update, this));
  }

  /** The words on every sign the room has, shown or not. */
  labels(): string[] {
    return this.signs.map((s) => s.label);
  }

  /** The words on the one sign showing now, if any. */
  shown(): string | null {
    return this.signs.find((s) => s.id === this.focused)?.label ?? null;
  }

  /** The box of the one sign showing now (room px), if any: what else lies on the floor keeps clear of it (the prompt at the owl's feet, OP-344). */
  shownBox(): { left: number; right: number; top: number; bottom: number } | null {
    const sign = this.signs.find((s) => s.id === this.focused);
    if (!sign) return null;
    const b = sign.text.getBounds();
    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
  }

  /**
   * Whether this doorway's sign stands whole on screen now: then its words are there to read, and no
   * chip at the screen's edge repeats them (the Great Hollow on a phone held sideways, Nov 8).
   */
  onScreen(id: string): boolean {
    const sign = this.signs.find((s) => s.id === id);
    if (!sign) return false;
    const v = this.scene.cameras.main.worldView;
    const b = sign.text.getBounds();
    return v.width > 0 && b.left >= v.left && b.right <= v.right && b.top >= v.top && b.bottom <= v.bottom;
  }

  /** Show the sign of this doorway alone (none for null or a doorway with no sign), fading. */
  focus(id: string | null): void {
    if (id === this.focused) return;
    this.focused = id;
    for (const { text, id: door } of this.signs) {
      this.scene.tweens.killTweensOf(text);
      this.scene.tweens.add({ targets: text, alpha: door === id ? 1 : 0, duration: FADE_MS, ease: 'Sine.easeOut' });
    }
  }

  private update(): void {
    const s = this.scale();
    if (s !== this.scaleNow) {
      this.scaleNow = s;
      // Drawn at twice the size and scaled down by half, so the words stay sharp when the camera zooms in.
      for (const { text } of this.signs) text.setScale(s / 2);
    }
    const shown = this.signs.find((x) => x.id === this.focused);
    if (!shown) return;
    const view = this.scene.cameras.main.worldView;
    const w = shown.text.displayWidth;
    // The sign's middle, from the part of it that stands at its spot.
    const half = (0.5 - shown.anchor) * w;
    const middle = view.width > 0 ? signX(shown.at.x + half, w, { x: view.x, w: view.width }, 12 * s) : shown.at.x + half;
    shown.text.x = middle - half;
    shown.text.y = signY({ x: middle, y: shown.at.y }, w, shown.text.displayHeight, this.owl());
  }
}


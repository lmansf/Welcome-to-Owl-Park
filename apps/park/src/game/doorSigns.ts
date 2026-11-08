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
import { signY, signedDoors } from './hints';

/** Room pixels per screen pixel now: what keeps a sign the same size on any screen. */
type Scale = () => number;

/** The sign's words on screen, in CSS pixels. */
const FONT_PX = 15;

/** How long a sign takes to fade in or out (ms). */
const FADE_MS = 220;

/** Just over the floor's edges (walkFloor, -0.6), under every piece and owl: a sign never covers the owl. */
const SIGN_DEPTH = -0.5;

export class DoorSigns {
  private readonly signs: Array<{ text: Phaser.GameObjects.Text; label: string; id: string; at: { x: number; y: number } }> = [];
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
        .setOrigin(0.5, 0)
        // On the floor: an owl walking up to the doorway stands over it, from either side.
        .setDepth(SIGN_DEPTH)
        .setAlpha(0);
      this.signs.push({ text, label: d.label!, id: d.id, at });
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
    if (shown) shown.text.y = signY(shown.at, shown.text.displayWidth, shown.text.displayHeight, this.owl());
  }
}


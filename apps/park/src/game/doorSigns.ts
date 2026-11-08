/**
 * The signs naming where a room's doorways lead (DoorDef.label), in a room seen from above: one small
 * board on the floor at each named doorway, the same size on any screen, so an owl standing in the
 * Great Hollow can read which doorway is the Party Grove and which the stair up (Logan, Nov 8: "i
 * can't even find the grove"). A room seen from the side marks its doorways its own way (treeView).
 */
import Phaser from 'phaser';
import type { RoomDef, WalkMap } from '@owl-park/shared';
import { signedDoors } from './hints';

/** Room pixels per screen pixel now: what keeps a sign the same size on any screen. */
type Scale = () => number;

/** The sign's words on screen, in CSS pixels. */
const FONT_PX = 15;

export class DoorSigns {
  private readonly signs: Array<{ text: Phaser.GameObjects.Text; label: string }> = [];
  private scaleNow = 0;

  constructor(
    scene: Phaser.Scene,
    room: RoomDef,
    private readonly scale: Scale,
    map: WalkMap = 1,
    shut: (roomId: string) => boolean = () => false,
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
        // On the floor: an owl walking up to the doorway stands over it.
        .setDepth(at.y);
      this.signs.push({ text, label: d.label! });
    }
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.update, this));
  }

  /** The words on the signs drawn now. */
  labels(): string[] {
    return this.signs.map((s) => s.label);
  }

  private update(): void {
    const s = this.scale();
    if (s === this.scaleNow) return;
    this.scaleNow = s;
    // Drawn at twice the size and scaled down by half, so the words stay sharp when the camera zooms in.
    for (const { text } of this.signs) text.setScale(s / 2);
  }
}

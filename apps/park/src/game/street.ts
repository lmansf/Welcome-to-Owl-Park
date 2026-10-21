import Phaser from 'phaser';
import { NEST_WORDS, STREET_ROOM, nestDoorIndex, type NestLook, type RoomDef } from '@owl-park/shared';
import type { StreetDoor } from './nestPlan';

const INK = 0x0c1e36;

/** A colour from a look ('#RRGGBB'); cream for anything else. */
function hex(c: string | undefined): number {
  return c && /^#[0-9a-f]{6}$/i.test(c) ? Number.parseInt(c.slice(1), 16) : 0xf6f1e3;
}

/**
 * The street's doors as this visitor sees them: a small flag in its owner's colours over each door
 * someone lives behind, a warm light in its doorway, and "Your nest" over door 0. A door nobody
 * lives behind stays dark. Flags hang over the doorways, behind every owl on the lane.
 */
export class StreetDoors {
  private objects: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly room: RoomDef,
  ) {}

  /** Draw the doors for this answer; `mine` is the visitor's own colours, for door 0's flag. */
  show(doors: readonly StreetDoor[], mine: NestLook): void {
    this.clear();
    for (const door of this.room.doors) {
      const n = nestDoorIndex(door.id);
      const d = n === null ? undefined : doors[n];
      const m = door.marker;
      if (!d || !m || d.kind === 'empty') continue;
      const lit = this.scene.add
        .image(m.x, door.rect.y - 70, 'fx-glow')
        .setTint(0xffd27a)
        .setAlpha(0.2)
        .setScale(1.25, 1.1)
        .setDepth(1)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.objects.push(lit, this.flag(m.x, m.y, d.kind === 'own' ? mine : (d.look ?? null)));
      if (d.kind === 'own') {
        const label = this.scene.add
          .text(m.x, m.y - 58, NEST_WORDS.yourNest, { fontSize: '26px', fontStyle: 'bold', color: '#F6F1E3', fontFamily: 'system-ui, sans-serif', stroke: '#0C1E36', strokeThickness: 6 })
          .setOrigin(0.5, 1)
          .setDepth(m.y);
        this.objects.push(label);
      }
    }
  }

  /** A swallow-tailed pennant on a short rod: the owner's body colour, a belly band, an accent tail. */
  private flag(x: number, y: number, look: NestLook | null): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics().setDepth(y);
    const w = 52;
    const top = y - 34;
    const body = look ? hex(look.body) : 0x8b5a2b;
    const belly = look ? hex(look.belly) : 0xf6f1e3;
    const accent = look ? hex(look.accent) : 0xc9a227;
    // The rod it hangs from.
    g.fillStyle(0x5c4033, 1);
    g.fillRoundedRect(x - w / 2 - 8, top - 6, w + 16, 7, 3);
    // The pennant, top to tail.
    const left = x - w / 2;
    g.fillStyle(body, 1);
    g.fillRect(left, top, w, 26);
    g.fillStyle(belly, 1);
    g.fillRect(left, top + 26, w, 12);
    g.fillStyle(accent, 1);
    g.fillTriangle(left, top + 38, x, top + 38, left, top + 60);
    g.fillTriangle(x, top + 38, left + w, top + 38, left + w, top + 60);
    g.fillRect(left, top + 38, w, 6);
    g.lineStyle(2, INK, 0.8);
    g.beginPath();
    g.moveTo(left, top);
    g.lineTo(left, top + 60);
    g.lineTo(x, top + 44);
    g.lineTo(left + w, top + 60);
    g.lineTo(left + w, top);
    g.closePath();
    g.strokePath();
    return g;
  }

  clear(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
  }

  destroy(): void {
    this.clear();
  }
}

/** "To the nests" by each door that leads to the street (the lobby's west end), pointing the way. */
export function addNestsSign(scene: Phaser.Scene, room: RoomDef): void {
  for (const d of room.doors) {
    if (d.to?.room !== STREET_ROOM) continue;
    const m = d.marker ?? { x: d.rect.x + d.rect.w / 2, y: d.rect.y };
    const west = m.x < room.size.w / 2;
    scene.add
      .text(west ? Math.max(16, d.rect.x + 16) : Math.min(room.size.w - 16, d.rect.x + d.rect.w - 16), m.y - 12, west ? `← ${NEST_WORDS.toNests}` : `${NEST_WORDS.toNests} →`, {
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#F6F1E3',
        fontFamily: 'system-ui, sans-serif',
        stroke: '#0C1E36',
        strokeThickness: 6,
      })
      .setOrigin(west ? 0 : 1, 1)
      .setDepth(m.y);
  }
}

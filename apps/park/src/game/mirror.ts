/**
 * A nest's standing mirror (OP-077), drawn in code: a wooden oval on a little stand against the back
 * wall, its glass catching the lamplight, in the warm wood and gold of the nest's painting. No
 * painted art. It stands on the floor like a piece of furniture, so owls are drawn in front of it or
 * behind it by where they stand.
 */
import Phaser from 'phaser';
import type { Vec2 } from '@owl-park/shared';
import { symbolTexture } from './symbols';

const KEY = 'nest-mirror';
/** Its size in room pixels, the stand included; it is drawn at twice that. */
const W = 84;
const H = 150;

function mirrorCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W * 2;
  c.height = H * 2;
  const g = c.getContext('2d')!;
  const cx = W;
  const cy = 120;
  // The stand: two splayed legs on a foot, under the frame.
  g.lineCap = 'round';
  g.strokeStyle = '#5A3A20';
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(cx - 26, 214);
  g.lineTo(cx - 46, 290);
  g.moveTo(cx + 26, 214);
  g.lineTo(cx + 46, 290);
  g.moveTo(cx - 58, 291);
  g.lineTo(cx + 58, 291);
  g.stroke();
  // The frame: dark wood with a gold line inside.
  const wood = g.createLinearGradient(0, 10, 0, 230);
  wood.addColorStop(0, '#9A6A3E');
  wood.addColorStop(1, '#6B4426');
  g.fillStyle = wood;
  g.strokeStyle = '#3E2614';
  g.lineWidth = 4;
  g.beginPath();
  g.ellipse(cx, cy, 74, 106, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.strokeStyle = '#C9A227';
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(cx, cy, 64, 96, 0, 0, Math.PI * 2);
  g.stroke();
  // The glass: cool and silvery, warmer low down where the lamp and the hearth light it.
  g.save();
  g.beginPath();
  g.ellipse(cx, cy, 60, 92, 0, 0, Math.PI * 2);
  g.clip();
  const glass = g.createLinearGradient(cx - 60, cy - 92, cx + 60, cy + 92);
  glass.addColorStop(0, '#E9F2F4');
  glass.addColorStop(0.55, '#A9C3CE');
  glass.addColorStop(1, '#7896A6');
  g.fillStyle = glass;
  g.fillRect(cx - 60, cy - 92, 120, 184);
  const warm = g.createLinearGradient(0, cy + 20, 0, cy + 92);
  warm.addColorStop(0, 'rgba(255,211,106,0)');
  warm.addColorStop(1, 'rgba(255,211,106,0.28)');
  g.fillStyle = warm;
  g.fillRect(cx - 60, cy + 20, 120, 72);
  // Two streaks of light across it.
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = 15;
  g.beginPath();
  g.moveTo(cx - 52, cy + 64);
  g.lineTo(cx + 14, cy - 96);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.24)';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(cx - 20, cy + 86);
  g.lineTo(cx + 46, cy - 70);
  g.stroke();
  g.restore();
  // A knob on top.
  g.fillStyle = '#8A5A33';
  g.strokeStyle = '#3E2614';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, 12, 9, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#FFD36A';
  g.beginPath();
  g.arc(cx - 2, 10, 2.5, 0, Math.PI * 2);
  g.fill();
  return c;
}

export class NestMirror {
  private readonly image: Phaser.GameObjects.Image;

  /** `at` is the middle of its foot (NEST_MIRROR). */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly at: Vec2,
  ) {
    if (!scene.textures.exists(KEY)) scene.textures.addCanvas(KEY, mirrorCanvas());
    this.image = scene.add.image(at.x, at.y, KEY).setOrigin(0.5, 1).setDisplaySize(W, H).setDepth(at.y);
  }

  /** A sparkle running down the glass: the mirror catching the light (no words). */
  glint(): void {
    const top = this.at.y - H + 18;
    const star = this.scene.add
      .image(this.at.x - 18, top + 24, symbolTexture(this.scene, 'star4'))
      .setTint(0xffffff)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(this.at.y + 1)
      .setScale(0.2)
      .setAlpha(0);
    this.scene.tweens.chain({
      targets: star,
      tweens: [
        { alpha: 1, scale: 0.75, angle: 45, duration: 320, ease: 'Sine.easeOut' },
        { x: this.at.x + 16, y: top + 92, angle: 120, duration: 520, ease: 'Sine.easeInOut' },
        { alpha: 0, scale: 0.2, duration: 300, ease: 'Sine.easeIn' },
      ],
      onComplete: () => star.destroy(),
    });
  }

  destroy(): void {
    this.image.destroy();
  }
}

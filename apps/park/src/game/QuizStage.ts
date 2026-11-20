import Phaser from 'phaser';
import { QUIZ_ZONE_IDS, rectCenter, type QuizStageDef, type QuizZone } from '@owl-park/shared';
import { symbolTexture } from './symbols';

/** The answer zones' colours (the quiz card in the HUD uses the same ones). */
const TINTS: Record<QuizZone, number> = { a: 0x9fe8ff, b: 0xffd36a, c: 0xff8cc6 };

/**
 * The stage quiz (activities.ts, QUIZ_STAGES): in the plaza's east bay before its stump stage, or out in
 * front of the Great Hollow's heart. The three answer zones on the floor, lettered A, B and C, and a
 * spotlight on the stage. The question itself is on the HUD's card, readable on any screen.
 */
export class QuizPlates {
  private readonly glows = new Map<QuizZone, Phaser.GameObjects.Image>();
  private readonly rings = new Map<QuizZone, Phaser.GameObjects.Graphics>();
  private readonly letters = new Map<QuizZone, Phaser.GameObjects.Text>();
  private readonly spot: Phaser.GameObjects.Image;
  private shown = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly stage: QuizStageDef,
  ) {
    /** On the floor: under every owl standing on the plates. */
    const DEPTH = stage.depth;
    for (const z of QUIZ_ZONE_IDS) {
      const r = stage.zones[z];
      const c = rectCenter(r);
      this.glows.set(z, scene.add.image(c.x, c.y, 'fx-glow').setTint(TINTS[z]).setScale(r.w / 210, r.h / 230).setAlpha(0.12).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH));
      const ring = scene.add.graphics().setDepth(DEPTH + 1);
      ring.lineStyle(4, TINTS[z], 1);
      ring.strokeEllipse(c.x, c.y, r.w * 0.92, r.h * 0.78);
      this.rings.set(z, ring.setAlpha(0.35));
      this.letters.set(
        z,
        scene.add
          .text(c.x, c.y, z.toUpperCase(), { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', fontSize: '46px', fontStyle: 'bold', color: '#F6F1E3', stroke: '#0C1E36', strokeThickness: 7 })
          .setOrigin(0.5)
          .setAlpha(0.55)
          .setDepth(DEPTH + 2),
      );
    }
    this.spot = scene.add.image(stage.stage.x, stage.stage.y - 40, 'fx-glow').setTint(0xfff1c1).setScale(1.6, 1).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH - 1);
  }

  /** While a question is open the zones light up; once it closes the right one glows gold and the others dim. */
  show(phase: 'open' | 'reveal' | 'wait', right?: QuizZone): void {
    const key = `${phase}:${right ?? ''}`;
    if (key === this.shown) return;
    this.shown = key;
    for (const z of QUIZ_ZONE_IDS) {
      const on = phase === 'open' || (phase === 'reveal' && z === right);
      const dim = phase === 'reveal' && z !== right;
      this.scene.tweens.add({ targets: this.glows.get(z)!, alpha: on ? (phase === 'reveal' ? 0.6 : 0.3) : 0.12, duration: 300 });
      this.scene.tweens.add({ targets: this.rings.get(z)!, alpha: on ? 0.95 : dim ? 0.15 : 0.35, duration: 300 });
      this.scene.tweens.add({ targets: this.letters.get(z)!, alpha: on ? 1 : dim ? 0.25 : 0.55, duration: 300 });
      if (phase === 'reveal' && z === right) this.sparkle(z);
    }
    this.scene.tweens.add({ targets: this.spot, alpha: phase === 'wait' ? 0 : 0.28, duration: 500 });
  }

  private sparkle(z: QuizZone): void {
    const c = rectCenter(this.stage.zones[z]);
    const burst = this.scene.add
      .particles(c.x, c.y - 20, symbolTexture(this.scene, 'star4'), {
        emitting: false,
        speed: { min: 60, max: 180 },
        lifespan: { min: 600, max: 1100 },
        scale: { start: 0.5, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [TINTS[z], 0xffd36a, 0xffffff],
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(this.stage.depth + 3);
    burst.explode(18);
    this.scene.time.delayedCall(1200, () => burst.destroy());
  }

  destroy(): void {
    for (const o of [...this.glows.values(), ...this.rings.values(), ...this.letters.values(), this.spot]) {
      this.scene.tweens.killTweensOf(o);
      o.destroy();
    }
  }
}

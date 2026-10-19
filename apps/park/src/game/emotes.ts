/**
 * Emotes: short animations of an owl's pose container (never the layers themselves, so walking,
 * facing and breathing keep working underneath) plus little bursts of shapes. Everyone in the
 * room plays the same emote on their copy of the owl. No letters: sleep is bubbles, surprise
 * is a bar and a dot.
 */
import Phaser from 'phaser';
import { symbolTexture, type SymbolName } from './symbols';
import type { AnchorName } from './fx';

export interface EmoteHost {
  readonly scene: Phaser.Scene;
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  /** The container emotes move, in owl canvas units with its origin at the feet. */
  readonly pose: Phaser.GameObjects.Container;
  /** Which way the owl faces in the room (for bursts, which fly in room space). */
  facing(): 1 | -1;
  /** Which way the owl faces inside `pose` (the painting's own turn): pose tweens lean this way to lean forward. */
  forward(): 1 | -1;
  anchor(name: AnchorName): { x: number; y: number };
  /** Close the eyes for a while (the blink frame). */
  closeEyes(ms: number): void;
}

/** Body height in owl canvas units: the pivot for spins and flips is the middle of the owl. */
const MID = 120;

function reset(pose: Phaser.GameObjects.Container): void {
  pose.scene.tweens.killTweensOf(pose);
  pose.setPosition(0, 0).setRotation(0).setScale(1, 1).setAlpha(1);
}

function burst(host: EmoteHost, symbol: SymbolName, at: AnchorName, tints: number[], config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, count: number): void {
  const scene = host.scene;
  const a = host.anchor(at);
  const e = scene.add.particles(host.x + a.x, host.y + a.y, symbolTexture(scene, symbol), { emitting: false, tint: tints, ...config });
  e.setDepth(host.depth + 1);
  e.explode(count);
  scene.time.delayedCall(2600, () => e.destroy());
}

/** Rotate the pose about the middle of the owl (not its feet). */
function spinAbout(host: EmoteHost, turns: number, duration: number, lift = 0): void {
  const pose = host.pose;
  const state = { t: 0 };
  host.scene.tweens.add({
    targets: state,
    t: 1,
    duration,
    ease: 'Sine.easeInOut',
    onUpdate: () => {
      const th = state.t * turns * Math.PI * 2;
      pose.setRotation(th);
      pose.setPosition(-MID * Math.sin(th), -MID + MID * Math.cos(th) - Math.sin(state.t * Math.PI) * lift);
    },
    onComplete: () => reset(pose),
  });
}

/** Turn around in place: the pose flips through its edge `times` times. */
function turnAround(host: EmoteHost, times: number, duration: number): void {
  host.scene.tweens.add({ targets: host.pose, scaleX: -1, duration: duration / (times * 2), yoyo: true, repeat: times - 1, ease: 'Sine.easeInOut', onComplete: () => reset(host.pose) });
}

/** A belly-flop into a leaf pile: up, a lean forward and a squashy landing. Not an emote: anyone can flop. */
export function playFlop(host: EmoteHost): void {
  const pose = host.pose;
  reset(pose);
  const lean = host.forward();
  host.scene.tweens.chain({
    targets: pose,
    tweens: [
      { y: -64, angle: 16 * lean, duration: 210, ease: 'Quad.easeOut' },
      { y: 6, angle: 64 * lean, scaleX: 1.12, scaleY: 0.78, duration: 170, ease: 'Quad.easeIn' },
      { y: 0, angle: 0, scaleX: 1, scaleY: 1, duration: 280, delay: 260, ease: 'Back.easeOut' },
    ],
    onComplete: () => reset(pose),
  });
}

export function playEmote(host: EmoteHost, emote: string): boolean {
  const scene = host.scene;
  const pose = host.pose;
  reset(pose);
  const tw = (config: Omit<Phaser.Types.Tweens.TweenBuilderConfig, 'targets'>) => scene.tweens.add({ targets: pose, ...config, onComplete: () => reset(pose) });
  const gold = 0xffd36a;
  const cream = 0xf6f1e3;
  switch (emote) {
    case 'hoot':
      tw({ scaleX: 1.08, scaleY: 1.1, duration: 140, yoyo: true, repeat: 1, ease: 'Quad.easeOut' });
      burst(host, 'ring', 'beak', [cream, gold], { speedX: { min: 20 * host.facing(), max: 50 * host.facing() }, speedY: { min: -30, max: -10 }, scale: { start: 0.2, end: 0.9 }, alpha: { start: 0.9, end: 0 }, lifespan: 700 }, 3);
      return true;
    case 'flap':
      tw({ scaleX: 1.14, scaleY: 0.94, y: -10, duration: 110, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
      burst(host, 'leaf', 'chest', [cream, 0xd9c7a5], { speed: { min: 40, max: 110 }, angle: { min: 180, max: 360 }, gravityY: 90, rotate: { min: 0, max: 360 }, scale: { start: 0.35, end: 0.15 }, alpha: { start: 1, end: 0 }, lifespan: 900 }, 8);
      return true;
    case 'spin':
      turnAround(host, 2, 700);
      return true;
    case 'hop':
      tw({ y: -46, duration: 220, yoyo: true, ease: 'Quad.easeOut' });
      return true;
    case 'tilt':
      tw({ angle: 14 * host.forward(), duration: 260, yoyo: true, hold: 500, ease: 'Sine.easeInOut' });
      return true;
    case 'bow':
      tw({ angle: 22 * host.forward(), y: 8, duration: 320, yoyo: true, hold: 300, ease: 'Sine.easeInOut' });
      return true;
    case 'wave':
      tw({ angle: { from: -8, to: 8 }, duration: 160, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
      return true;
    case 'dance':
      tw({ y: -26, angle: { from: -10, to: 10 }, duration: 200, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
      burst(host, 'note', 'head', [gold, cream, 0xff2aa1], { speedY: { min: -60, max: -30 }, speedX: { min: -30, max: 30 }, scale: { start: 0.4, end: 0.25 }, alpha: { start: 1, end: 0 }, lifespan: 1000 }, 4);
      return true;
    case 'sleep':
      host.closeEyes(2200);
      tw({ angle: 6 * host.forward(), y: 4, duration: 600, yoyo: true, hold: 1000, ease: 'Sine.easeInOut' });
      for (let i = 0; i < 3; i++) scene.time.delayedCall(i * 500, () => burst(host, 'bubble', 'head', [cream, 0xbfe9ff], { speedY: { min: -40, max: -26 }, speedX: { min: 8, max: 18 }, scale: { start: 0.25 + i * 0.1, end: 0.45 + i * 0.1 }, alpha: { start: 0.9, end: 0 }, lifespan: 1200 }, 1));
      return true;
    case 'heart':
      tw({ scaleX: 1.06, scaleY: 1.06, duration: 180, yoyo: true, ease: 'Sine.easeOut' });
      burst(host, 'heart', 'head', [0xff2aa1, 0xe0115f, 0xff8cc6], { speed: { min: 30, max: 80 }, angle: { min: 220, max: 320 }, scale: { start: 0.45, end: 0.2 }, alpha: { start: 1, end: 0 }, lifespan: 1100 }, 6);
      return true;
    case 'surprise':
      tw({ y: -22, scaleY: 1.08, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
      burst(host, 'bang', 'head', [gold], { speedY: { min: -30, max: -20 }, scale: { start: 0.7, end: 0.6 }, alpha: { start: 1, end: 0 }, lifespan: 900 }, 1);
      return true;
    case 'laugh':
      tw({ x: { from: -4, to: 4 }, scaleY: 0.97, duration: 60, yoyo: true, repeat: 7, ease: 'Linear' });
      return true;
    case 'shiver':
      tw({ x: { from: -3, to: 3 }, duration: 40, yoyo: true, repeat: 11, ease: 'Linear' });
      burst(host, 'flake', 'head', [0xbfe9ff, 0xffffff], { speed: { min: 20, max: 50 }, angle: { min: 200, max: 340 }, scale: { start: 0.3, end: 0.1 }, alpha: { start: 1, end: 0 }, lifespan: 900 }, 5);
      return true;
    case 'puff':
      tw({ scaleX: 1.18, scaleY: 1.12, duration: 380, yoyo: true, hold: 300, ease: 'Back.easeOut' });
      return true;
    case 'wink':
      host.closeEyes(260);
      tw({ angle: 6 * host.forward(), duration: 130, yoyo: true, ease: 'Sine.easeOut' });
      burst(host, 'star4', 'eyes', [gold, cream], { speed: { min: 30, max: 60 }, scale: { start: 0.4, end: 0 }, alpha: { start: 1, end: 0 }, lifespan: 600 }, 3);
      return true;
    case 'nod':
      tw({ y: 8, angle: 5 * host.forward(), duration: 150, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
      return true;
    case 'headshake':
      tw({ angle: { from: -7, to: 7 }, duration: 110, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
      return true;
    case 'twirl':
      turnAround(host, 4, 1200);
      burst(host, 'star4', 'chest', [gold, cream, 0xc8a2ff], { speed: { min: 50, max: 120 }, scale: { start: 0.45, end: 0 }, alpha: { start: 1, end: 0 }, lifespan: 900 }, 12);
      return true;
    case 'flip':
      spinAbout(host, -host.forward(), 650, 70);
      burst(host, 'star4', 'feet', [gold, cream], { speed: { min: 40, max: 100 }, angle: { min: 200, max: 340 }, scale: { start: 0.4, end: 0 }, alpha: { start: 1, end: 0 }, lifespan: 700 }, 8);
      return true;
    case 'stomp':
      tw({ y: -16, duration: 120, yoyo: true, ease: 'Quad.easeIn' });
      scene.time.delayedCall(240, () => burst(host, 'puff', 'feet', [0xd9c7a5, 0xbfa987], { speed: { min: 30, max: 70 }, angle: { min: 160, max: 380 }, scale: { start: 0.3, end: 0.6 }, alpha: { start: 0.7, end: 0 }, lifespan: 600 }, 6));
      return true;
    case 'preen':
      tw({ angle: -10 * host.forward(), x: -4 * host.forward(), duration: 300, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
      burst(host, 'leaf', 'chest', [cream], { speed: { min: 10, max: 40 }, gravityY: 40, rotate: { min: 0, max: 360 }, scale: { start: 0.25, end: 0.1 }, alpha: { start: 1, end: 0 }, lifespan: 1200 }, 3);
      return true;
    case 'stretch':
      tw({ scaleY: 1.16, scaleX: 0.94, duration: 420, yoyo: true, hold: 260, ease: 'Sine.easeInOut' });
      return true;
    case 'sneeze':
      tw({ x: 10 * host.forward(), angle: 8 * host.forward(), duration: 90, yoyo: true, ease: 'Quad.easeOut', delay: 300 });
      scene.time.delayedCall(320, () => burst(host, 'puff', 'beak', [cream, 0xbfe9ff], { speedX: { min: 60 * host.facing(), max: 120 * host.facing() }, speedY: { min: -20, max: 20 }, scale: { start: 0.2, end: 0.6 }, alpha: { start: 0.8, end: 0 }, lifespan: 600 }, 6));
      return true;
    case 'peek':
      tw({ scaleY: 0.4, y: 10, duration: 200, yoyo: true, hold: 500, ease: 'Back.easeIn' });
      return true;
    default:
      return false;
  }
}

import Phaser from 'phaser';
import type { PuzzleSymbol, Vec2 } from '@owl-park/shared';
import { symbolTexture, type SymbolName } from './symbols';

/** A clue's symbol, drawn with the park's own shapes. */
export const CLUE_SHAPE: Record<PuzzleSymbol, SymbolName> = { moon: 'crescent', leaf: 'leaf', feather: 'feather', acorn: 'acorn', star: 'star5', mushroom: 'mushroom' };

export type PuzzleMarkKind = 'lock' | 'clue' | 'key';

/** How a mark looks: a lock (open, waiting for the locks before it, or ready), a clue (unread, or its symbol once read), a key. */
export interface PuzzleMarkLook {
  kind: PuzzleMarkKind;
  /** A lock: 'ready' (can be worked), 'waiting' (locks before it first), 'open'. */
  state?: 'ready' | 'waiting' | 'open';
  /** A read clue's symbol. */
  symbol?: PuzzleSymbol | null;
}

const TINT = { ready: 0xffd36a, waiting: 0x8a94a6, open: 0x8fe3a8, clue: 0x9fe8ff, read: 0xf6f1e3, key: 0xe2bd5c } as const;

/**
 * A puzzle quest's piece in the room (OP-255): a lock post, a carved clue or a key, drawn in code
 * as a placeholder until OP-256's art (a soft glow and a symbol over it, like a quest item). Only the
 * owls in the run see it; one up on a perch is drawn `top` above its spot.
 */
export class PuzzleMarker {
  private readonly root: Phaser.GameObjects.Container;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly icon: Phaser.GameObjects.Image;
  private look: string;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly quest: string,
    readonly lock: string,
    readonly kind: PuzzleMarkKind,
    /** A clue's number in its lock's code; 0 for a lock or a key. */
    readonly n: number,
    readonly pos: Vec2,
    readonly top: number,
    look: PuzzleMarkLook,
  ) {
    this.glow = scene.add.image(0, 0, 'fx-glow').setAlpha(0.5).setScale(0.38, 0.15).setBlendMode(Phaser.BlendModes.ADD);
    this.icon = scene.add.image(0, kind === 'lock' ? -34 : -24, symbolTexture(scene, 'dot'));
    const parts: Phaser.GameObjects.GameObject[] = [this.glow];
    if (kind === 'lock') parts.push(scene.add.rectangle(0, -12, 8, 26, 0x6b4a2b).setStrokeStyle(1, 0x2b1d10));
    parts.push(this.icon);
    this.root = scene.add.container(pos.x, pos.y - top, parts).setDepth(pos.y - 1);
    if (kind !== 'lock') scene.tweens.add({ targets: this.icon, y: this.icon.y - 6, duration: 950, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.look = '';
    this.setLook(look);
  }

  get key(): string {
    return markKey(this.quest, this.lock, this.kind, this.n);
  }

  /** Redraw for a new look (a clue read, a lock opened); nothing when it is the same. */
  setLook(look: PuzzleMarkLook): void {
    const sig = `${look.kind}:${look.state ?? ''}:${look.symbol ?? ''}`;
    if (sig === this.look) return;
    this.look = sig;
    let shape: SymbolName;
    let tint: number;
    if (look.kind === 'lock') {
      shape = 'keyhole';
      tint = TINT[look.state ?? 'waiting'];
    } else if (look.kind === 'key') {
      shape = 'key';
      tint = TINT.key;
    } else if (look.symbol) {
      shape = CLUE_SHAPE[look.symbol];
      tint = TINT.read;
    } else {
      shape = 'ask';
      tint = TINT.clue;
    }
    this.icon.setTexture(symbolTexture(this.scene, shape)).setTint(tint).setScale(look.kind === 'lock' ? 1 : 1.1);
    this.glow.setTint(tint).setAlpha(look.kind === 'lock' && look.state === 'waiting' ? 0.2 : 0.5);
  }

  /** A short pop, for a clue read, a key taken or a lock opened. */
  pulse(): void {
    this.scene.tweens.add({ targets: this.root, scale: 1.25, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.root);
    this.scene.tweens.killTweensOf(this.icon);
    this.root.destroy();
  }
}

export const markKey = (quest: string, lock: string, kind: PuzzleMarkKind, n: number) => `${quest}|${lock}|${kind}|${n}`;

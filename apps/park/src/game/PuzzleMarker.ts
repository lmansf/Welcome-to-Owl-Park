import Phaser from 'phaser';
import type { PuzzleSymbol, Vec2 } from '@owl-park/shared';
import { ART } from './art';
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

/** The art a mark is drawn with once the room has it (OP-256); until then the code-drawn stand-in. */
const PUZZLE_ART = { lockClosed: 'kit-puzzle-lock-closed', lockOpen: 'kit-puzzle-lock-open', carving: 'kit-puzzle-carving', key: 'kit-puzzle-key' } as const;
const symbolArt = (s: PuzzleSymbol) => `kit-puzzle-symbol-${s}`;

/**
 * A puzzle quest's piece in the room (OP-255): a lock post, a carved clue or a key, drawn with the
 * puzzle art (OP-256) once the room has loaded it, and in code until then (a soft glow and a symbol
 * over it, like a quest item). Only the owls in the run see it; one up on a perch is drawn `top`
 * above its spot. `redraw` is called when the art arrives after the mark was made.
 */
export class PuzzleMarker {
  private readonly root: Phaser.GameObjects.Container;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly icon: Phaser.GameObjects.Image;
  /** The code-drawn post of a lock, until the art is in. */
  private readonly stand: Phaser.GameObjects.Rectangle | null;
  /** The lock post or the clue carving, from the art. */
  private body: Phaser.GameObjects.Image | null = null;
  private look: string;
  private last: PuzzleMarkLook;

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
    this.stand = kind === 'lock' ? scene.add.rectangle(0, -12, 8, 26, 0x6b4a2b).setStrokeStyle(1, 0x2b1d10) : null;
    if (this.stand) parts.push(this.stand);
    parts.push(this.icon);
    this.root = scene.add.container(pos.x, pos.y - top, parts).setDepth(pos.y - 1);
    if (kind !== 'lock') scene.tweens.add({ targets: this.icon, y: this.icon.y - 6, duration: 950, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.look = '';
    this.last = look;
    this.setLook(look);
  }

  /** Whether the room has the puzzle art this mark needs (loaded after the room's own art). */
  private hasArt(): boolean {
    const t = this.scene.textures;
    if (this.kind === 'lock') return t.exists(PUZZLE_ART.lockClosed) && t.exists(PUZZLE_ART.lockOpen);
    if (this.kind === 'key') return t.exists(PUZZLE_ART.key);
    return t.exists(PUZZLE_ART.carving) && (!this.last.symbol || t.exists(symbolArt(this.last.symbol)));
  }

  /** An image of a published piece at its logical size (the texture may be a sharper copy). */
  private piece(key: string, x: number, y: number, originY: number): Phaser.GameObjects.Image {
    const spec = ART[key]!;
    return this.scene.add.image(x, y, key).setOrigin(0.5, originY).setDisplaySize(spec.w, spec.h);
  }

  /** Draw again with whatever the room has now: called when the puzzle art arrives. */
  redraw(): void {
    this.look = '';
    this.setLook(this.last);
  }

  get key(): string {
    return markKey(this.quest, this.lock, this.kind, this.n);
  }

  /** Redraw for a new look (a clue read, a lock opened); nothing when it is the same. */
  setLook(look: PuzzleMarkLook): void {
    this.last = look;
    const art = this.hasArt();
    const sig = `${art ? 'art' : 'code'}:${look.kind}:${look.state ?? ''}:${look.symbol ?? ''}`;
    if (sig === this.look) return;
    this.look = sig;
    if (art) {
      this.setArtLook(look);
      return;
    }
    this.body?.destroy();
    this.body = null;
    this.stand?.setVisible(true);
    this.icon.setVisible(true).setDisplaySize(32, 32);
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

  /** The look drawn with the puzzle art: the post shut or open, the carving blank or with its symbol, the key. */
  private setArtLook(look: PuzzleMarkLook): void {
    this.stand?.setVisible(false);
    this.body?.destroy();
    this.body = null;
    if (look.kind === 'lock') {
      const open = look.state === 'open';
      this.body = this.piece(open ? PUZZLE_ART.lockOpen : PUZZLE_ART.lockClosed, 0, 0, 1);
      this.root.addAt(this.body, 1);
      this.icon.setVisible(false);
      const tint = TINT[look.state ?? 'waiting'];
      this.glow.setTint(tint).setAlpha(look.state === 'waiting' ? 0.15 : open ? 0.35 : 0.5).setScale(0.5, 0.2);
      this.body.setAlpha(look.state === 'waiting' ? 0.8 : 1);
      return;
    }
    if (look.kind === 'key') {
      this.icon.setVisible(true).setTexture(PUZZLE_ART.key).clearTint().setScale(1).setDisplaySize(ART[PUZZLE_ART.key]!.w, ART[PUZZLE_ART.key]!.h);
      this.glow.setTint(TINT.key).setAlpha(0.5).setScale(0.38, 0.15);
      return;
    }
    this.body = this.piece(PUZZLE_ART.carving, 0, -24, 0.5);
    this.root.addAt(this.body, 1);
    if (look.symbol) {
      const key = symbolArt(look.symbol);
      this.icon.setVisible(true).setTexture(key).clearTint().setScale(1).setDisplaySize(36, 36);
      this.glow.setTint(TINT.read).setAlpha(0.35).setScale(0.38, 0.15);
    } else {
      this.icon.setVisible(true).setTexture(symbolTexture(this.scene, 'ask')).setTint(TINT.clue).setScale(1).setDisplaySize(28, 28);
      this.glow.setTint(TINT.clue).setAlpha(0.5).setScale(0.38, 0.15);
    }
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

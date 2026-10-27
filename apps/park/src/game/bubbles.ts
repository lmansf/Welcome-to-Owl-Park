import Phaser from 'phaser';
import { BUBBLE_MS, getPhrase } from '@owl-park/shared';
import type { Owl } from './Owl';

/** The bubble's words on screen, in CSS pixels, whatever the room's zoom: readable on a phone. */
const TEXT_CSS_PX = 15;
/** The words are drawn this big and scaled down, so they stay sharp on dense screens. */
const DRAWN_PX = 40;
/** The last part of a bubble's time it takes to fade. */
const FADE_MS = 400;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

interface Bubble {
  box: Phaser.GameObjects.Container;
  owl: Owl;
  n: number;
  until: number;
}

/**
 * Speech bubbles (C44): a phrase an owl says shows in a bubble above it for BUBBLE_MS, one bubble
 * per owl (a new phrase replaces the one before). The bubble follows its owl as it walks, and its
 * words keep the same size on every screen. With "Show what owls say" off, none is shown.
 */
export class SpeechBubbles {
  private readonly bubbles = new Map<string, Bubble>();
  private shown = true;

  /**
   * `depth` puts the bubbles over everything in the room; `cssPx` is how many room pixels make one
   * CSS pixel on this screen just now (it changes with the room's zoom).
   */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
    private readonly cssPx: () => number,
  ) {}

  /** "Show what owls say": off hides every bubble at once, and shows none until it is on again. */
  setShown(on: boolean): void {
    this.shown = on;
    if (!on) this.clear();
  }

  /** A phrase said by an owl; false when it is not one of the list's or bubbles are off. */
  say(owl: Owl, n: number, now: number): boolean {
    const phrase = getPhrase(n);
    if (!phrase || !this.shown) return false;
    this.drop(owl.id);
    const text = this.scene.add
      .text(0, 0, phrase.text, { fontFamily: FONT, fontSize: `${DRAWN_PX}px`, fontStyle: '700', color: '#0C1E36', align: 'center', wordWrap: { width: DRAWN_PX * 9 }, resolution: 2 })
      .setOrigin(0.5, 1);
    const padX = DRAWN_PX * 0.55;
    const padY = DRAWN_PX * 0.35;
    const w = text.width + padX * 2;
    const h = text.height + padY * 2;
    const tail = DRAWN_PX * 0.45;
    const g = this.scene.add.graphics();
    g.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2 + 3, -h - tail + 5, w, h, Math.min(h / 2, DRAWN_PX * 0.7));
    g.fillStyle(0xf6f1e3, 0.97).fillRoundedRect(-w / 2, -h - tail, w, h, Math.min(h / 2, DRAWN_PX * 0.7));
    g.fillTriangle(-tail * 0.8, -tail - 1, tail * 0.8, -tail - 1, 0, 0);
    g.lineStyle(3, 0xc9a227, 0.9).strokeRoundedRect(-w / 2, -h - tail, w, h, Math.min(h / 2, DRAWN_PX * 0.7));
    text.setPosition(0, -tail - padY);
    const box = this.scene.add.container(0, 0, [g, text]).setDepth(this.depth);
    this.bubbles.set(owl.id, { box, owl, n, until: now + BUBBLE_MS });
    this.place(this.bubbles.get(owl.id)!, now);
    return true;
  }

  /** Follow the owls, and let the bubbles that have had their time go. */
  tick(now: number): void {
    for (const [id, b] of this.bubbles) {
      if (now >= b.until || !b.owl.active) this.drop(id);
      else this.place(b, now);
    }
  }

  private place(b: Bubble, now: number): void {
    const k = this.cssPx();
    // Just above the head, or the hat on it, up with the owl in flight (OP-084), the same size on every screen.
    b.box.setPosition(b.owl.x + b.owl.anchor('head').x, b.owl.y + b.owl.crown() - b.owl.flightHeight() - 8 * k).setScale((TEXT_CSS_PX / DRAWN_PX) * k);
    b.box.setAlpha(Math.min(1, (b.until - now) / FADE_MS));
  }

  /** An owl's bubble goes (it left, or says something new). */
  drop(id: string): void {
    const b = this.bubbles.get(id);
    if (!b) return;
    b.box.destroy();
    this.bubbles.delete(id);
  }

  clear(): void {
    for (const id of [...this.bubbles.keys()]) this.drop(id);
  }

  /** The bubbles showing: whose, and which phrase (the tests read them). */
  showing(): Array<{ id: string; n: number }> {
    return [...this.bubbles.entries()].map(([id, b]) => ({ id, n: b.n }));
  }
}

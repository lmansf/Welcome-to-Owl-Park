import Phaser from 'phaser';
import type { NpcDef } from '@owl-park/shared';
import type { NpcMark } from '../collect/quests';
import { Owl } from './Owl';
import { symbolTexture, type SymbolName } from './symbols';

/** The marker over an NPC owl: gold "!" for a new quest, gold "?" for one to hand back, pale "?" when a step asks for it. */
const MARKS: Record<Exclude<NpcMark, null>, { symbol: SymbolName; tint: number }> = {
  offer: { symbol: 'bang', tint: 0xffd36a },
  ready: { symbol: 'ask', tint: 0xffd36a },
  step: { symbol: 'ask', tint: 0x9fe8ff },
};
/** How often an NPC plays one of its idle emotes (ms, random in between). */
const IDLE_MS: readonly [number, number] = [7_000, 16_000];
/** The marker floats this far above the feet (room pixels), clear of hats. */
const MARK_Y = -168;

export type NpcTap = (npc: NpcOwl, pointer: Phaser.Input.Pointer, event: Phaser.Types.Input.EventData) => void;

/**
 * A resident owl: an ordinary owl in its catalogue wear, standing in its spot, with its name
 * under its feet and a marker over its head when it has something for the visitor. It looks at
 * a visitor who comes close and plays an idle emote now and then. Tapping it is the scene's call.
 */
export class NpcOwl {
  readonly owl: Owl;
  private readonly label: Phaser.GameObjects.Text;
  private readonly mark: Phaser.GameObjects.Image;
  private readonly markGlow: Phaser.GameObjects.Image;
  private shown: NpcMark = null;
  private nextIdleAt: number;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly def: NpcDef,
    textureScale: number,
    onTap: NpcTap,
  ) {
    const { x, y } = def.pos;
    this.owl = new Owl(scene, `npc:${def.id}`, def.look, def.pos, textureScale);
    this.owl.face(def.facing);
    // The hit area is in the owl's own units (origin at the feet, before its scale).
    this.owl.setInteractive({ hitArea: new Phaser.Geom.Rectangle(-95, -235, 190, 245), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    this.owl.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => onTap(this, pointer, event));
    this.label = scene.add
      .text(x, y + 16, def.name, { fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', fontSize: '17px', fontStyle: '700', color: '#F6F1E3', stroke: '#0C1E36', strokeThickness: 4, resolution: 2 })
      .setOrigin(0.5, 0)
      .setDepth(y + 1);
    this.markGlow = scene.add.image(x, y + MARK_Y, 'fx-glow').setScale(0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(y + 2).setVisible(false);
    this.mark = scene.add.image(x, y + MARK_Y, symbolTexture(scene, 'bang')).setScale(1.15).setDepth(y + 3).setVisible(false);
    this.nextIdleAt = Date.now() + IDLE_MS[0] * Math.random();
  }

  get id(): string {
    return this.def.id;
  }

  setMark(mark: NpcMark): void {
    if (mark === this.shown) return;
    this.shown = mark;
    this.mark.setVisible(mark !== null);
    this.markGlow.setVisible(mark !== null);
    if (!mark) return;
    const { symbol, tint } = MARKS[mark];
    this.mark.setTexture(symbolTexture(this.scene, symbol)).setTint(tint);
    this.markGlow.setTint(tint);
  }

  /** Look at a visitor standing close, or back the usual way when there is none. */
  lookAt(x: number | null): void {
    this.owl.face(x === null || Math.abs(x - this.def.pos.x) < 8 ? this.def.facing : x > this.def.pos.x ? 1 : -1);
  }

  /** Say hello with one of its idle emotes (after a talk). */
  greet(): void {
    const e = this.def.idle[0];
    if (e) this.owl.playEmote(e);
    this.nextIdleAt = Date.now() + IDLE_MS[1];
  }

  tick(now: number): void {
    this.owl.tick(now);
    if (this.shown) {
      const bob = Math.sin(now / 320) * 5;
      this.mark.y = this.def.pos.y + MARK_Y + bob;
      this.markGlow.y = this.mark.y;
      this.markGlow.setAlpha(0.55 + Math.sin(now / 420) * 0.2);
    }
    if (now >= this.nextIdleAt) {
      const list = this.def.idle;
      const e = list[Math.floor(Math.random() * list.length)];
      if (e) this.owl.playEmote(e);
      this.nextIdleAt = now + IDLE_MS[0] + Math.random() * (IDLE_MS[1] - IDLE_MS[0]);
    }
  }

  destroy(): void {
    this.owl.destroy();
    this.label.destroy();
    this.mark.destroy();
    this.markGlow.destroy();
  }
}

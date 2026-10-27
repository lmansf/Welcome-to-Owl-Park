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
/**
 * The '!' over the owl the visitor can talk to now (OP-114): Interact's mark (a cream stroke and a
 * gold dot) on a dark pill, one colour in every realm. It pops in, bobs once a second (still under
 * calm motion), and fades as the visitor walks off. A quest's marker rises above it meanwhile.
 */
const APPROACH = { w: 38, h: 46, popMs: 120, fadeMs: 150, bob: 3, lift: 54 };

export type NpcTap = (npc: NpcOwl, pointer: Phaser.Input.Pointer, event: Phaser.Types.Input.EventData) => void;

/**
 * A resident owl: an ordinary owl in its catalogue wear, standing in its spot, with its name
 * under its feet, a marker over its head when it has something for the visitor, and a '!' when the
 * visitor can talk to it now. It looks at a visitor who comes close and plays an idle emote now and
 * then. Tapping it, or its '!', is the scene's call.
 */
export class NpcOwl {
  readonly owl: Owl;
  private readonly label: Phaser.GameObjects.Text;
  private readonly mark: Phaser.GameObjects.Image;
  private readonly markGlow: Phaser.GameObjects.Image;
  private readonly approach: Phaser.GameObjects.Container;
  private approachTween: Phaser.Tweens.Tween | null = null;
  private near = false;
  private calm = false;
  /** How far the quest marker stands raised over the '!' right now (it eases up and down). */
  private lift = 0;
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
    // Drawn as shapes, so it stays crisp however the room is scaled; tapping it talks, as tapping the owl does.
    const { w, h } = APPROACH;
    const pill = scene.add.graphics();
    pill.fillStyle(0x0c1e36, 0.9).fillRoundedRect(-w / 2, -h / 2, w, h, w / 2);
    pill.lineStyle(2, 0xf6f1e3, 0.55).strokeRoundedRect(-w / 2, -h / 2, w, h, w / 2);
    pill.fillStyle(0xf6f1e3, 1).fillRoundedRect(-3.2, -14, 6.4, 19, 3.2);
    pill.fillStyle(0xffd36a, 1).fillCircle(0, 11, 3.6);
    this.approach = scene.add.container(x, y + MARK_Y, [pill]).setDepth(y + 4).setVisible(false).setAlpha(0);
    this.approach.setInteractive({ hitArea: new Phaser.Geom.Rectangle(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    this.approach.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => onTap(this, pointer, event));
    this.nextIdleAt = Date.now() + IDLE_MS[0] * Math.random();
  }

  /** Whether its '!' says the visitor can talk to it now. */
  get approaching(): boolean {
    return this.near;
  }

  /** The visitor is (or is no longer) close enough to talk to this owl, the nearest such: its '!' shows or fades. */
  setApproach(on: boolean, calm: boolean): void {
    this.calm = calm;
    if (on === this.near) return;
    this.near = on;
    this.approachTween?.stop();
    if (on) {
      this.approach.setVisible(true);
      if (calm) {
        this.approach.setAlpha(1).setScale(1);
        return;
      }
      this.approach.setAlpha(0).setScale(0.6);
      this.approachTween = this.scene.tweens.add({ targets: this.approach, alpha: 1, scale: 1, duration: APPROACH.popMs, ease: 'Back.easeOut' });
    } else {
      this.approachTween = this.scene.tweens.add({ targets: this.approach, alpha: 0, duration: APPROACH.fadeMs, onComplete: () => this.approach.setVisible(false) });
    }
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
    this.lift += ((this.near ? APPROACH.lift : 0) - this.lift) * 0.25;
    if (this.approach.visible) this.approach.y = this.def.pos.y + MARK_Y + (this.calm ? 0 : Math.sin((now / 1000) * Math.PI * 2) * APPROACH.bob);
    if (this.shown) {
      const bob = Math.sin(now / 320) * 5;
      this.mark.y = this.def.pos.y + MARK_Y + bob - this.lift;
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
    this.approachTween?.stop();
    this.owl.destroy();
    this.label.destroy();
    this.mark.destroy();
    this.markGlow.destroy();
    this.approach.destroy();
  }
}

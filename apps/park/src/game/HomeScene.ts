import Phaser from 'phaser';
import type { ParkConfig } from '../config';
import { NEST_ROOM } from '../rooms';
import { loadArtCopy, prefetchRoomArt, releaseArt } from './art';

/** The game event the home scene sends as it comes up (main.ts shows the home screen's buttons then). */
export const HOME_SHOWN = 'owl-park:home';

/** The lobby's painting behind the home screen, under a texture key of its own. */
const BACKDROP = 'home-backdrop';
/** Where the carved-owl arch stands in the lobby's painting (room pixels): a narrow screen keeps it in view. */
const ARCH_X = 960;

/**
 * The home screen's backdrop (OP-065): the lobby's painting, dimmed, behind the buttons and the
 * visitor's own owl, which the builder's preview scene draws over this one. Nothing of the park
 * runs while it is up: Play starts the room scene in the owl's own nest, and the Menu's Home screen
 * comes back here.
 */
export class HomeScene extends Phaser.Scene {
  private art: Phaser.GameObjects.Image | null = null;
  private veil: Phaser.GameObjects.Rectangle | null = null;
  /** Bumped on each start and stop, so a painting that loads late is not added to a later screen. */
  private gen = 0;

  constructor() {
    super('home');
  }

  create(): void {
    const gen = ++this.gen;
    this.cameras.main.setBackgroundColor('#0C1E36');
    this.veil = this.add.rectangle(0, 0, 10, 10, 0x0c1e36, 0.55).setOrigin(0).setDepth(1);
    const onResize = () => this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.gen++;
      this.scale.off(Phaser.Scale.Events.RESIZE, onResize);
      this.art = null;
      this.veil = null;
      // A room loads its own art (the lobby's too) at the size it wants.
      releaseArt(this, [BACKDROP]);
    });
    this.layout();
    void loadArtCopy(this, 'lobby', BACKDROP).then((ok) => {
      if (gen !== this.gen) return;
      // Then, while the home screen waits on Play, the nest's art comes ahead (OP-129): Play goes to the owl's own nest, and every nest has the same.
      prefetchRoomArt(this, NEST_ROOM, this.registry.get('config') as ParkConfig);
      if (!ok) return;
      this.art = this.add.image(0, 0, BACKDROP).setDepth(0);
      this.layout();
    });
    this.game.events.emit(HOME_SHOWN);
  }

  /** The painting covers the screen, the arch as near the middle as the painting allows. */
  private layout(): void {
    const { width, height } = this.scale.gameSize;
    this.veil?.setSize(width, height);
    const art = this.art;
    if (!art) return;
    const k = Math.max(width / art.width, height / art.height);
    const w = art.width * k;
    const left = Math.min(0, Math.max(width - w, width / 2 - ARCH_X * k));
    art.setScale(k).setPosition(left + w / 2, height / 2);
  }
}

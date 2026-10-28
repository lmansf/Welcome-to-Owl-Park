import Phaser from 'phaser';
import type { ParkConfig } from '../config';
import type { LoadScreen } from '../ui/loader';
import { GLOBAL_ART, loadArt } from './art';

/**
 * Loads the art every room needs (owl layers, signs), then opens the home screen or the first room.
 * The load screen (OP-129), up since the page's first paint, shows the art coming.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    void this.boot();
  }

  private async boot(): Promise<void> {
    const cfg = this.registry.get('config') as ParkConfig;
    const screen = this.registry.get('loadScreen') as LoadScreen | undefined;
    screen?.show('Opening the park…');
    await loadArt(this, GLOBAL_ART, cfg.pixelRatio, cfg.artScaleMax, (done, total) => screen?.progress(done, total));
    // The home screen comes first (OP-065), taking the load screen down as it shows; an address
    // that names a room goes straight in, the load screen staying up for the room's art.
    if (cfg.home) {
      this.scene.start('home');
      return;
    }
    const start = this.registry.get('startRoom') as { room: string; spawn: string | undefined };
    this.scene.start('room', start);
  }
}

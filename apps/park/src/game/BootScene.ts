import Phaser from 'phaser';
import type { ParkConfig } from '../config';
import { GLOBAL_ART, loadArt } from './art';

/** Loads the art every room needs (owl layers, signs), then opens the home screen or the first room. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    void this.boot();
  }

  private async boot(): Promise<void> {
    const cfg = this.registry.get('config') as ParkConfig;
    const { width, height } = this.scale.gameSize;
    const label = this.add.text(width / 2, height / 2, 'Opening the park…', { fontSize: '28px', color: '#F6F1E3', fontFamily: 'system-ui, sans-serif' }).setOrigin(0.5);
    const bar = this.add.rectangle(width / 2, height / 2 + 40, 10, 6, 0xc9a227).setOrigin(0.5);
    await loadArt(this, GLOBAL_ART, cfg.pixelRatio, cfg.artScaleMax, (done, total) => bar.setSize(Math.max(10, (260 * done) / total), 6));
    label.destroy();
    bar.destroy();
    // The home screen comes first (OP-065); an address that names a room goes straight in.
    if (cfg.home) {
      this.scene.start('home');
      return;
    }
    const start = this.registry.get('startRoom') as { room: string; spawn: string | undefined };
    this.scene.start('room', start);
  }
}

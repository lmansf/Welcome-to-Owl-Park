import Phaser from 'phaser';
import { ROOM_H, ROOM_W } from '@owl-park/shared';
import { OWL_H, OWL_W } from './Owl';
import { loadSvgTexture } from './svgLoader';

export const ART_PATH = 'art/';

const ROOM_IMAGES = ['hub', 'hub-fg', 'grove', 'grove-fg', 'market', 'market-fg'];
const SET_PIECES: Record<string, { w: number; h: number }> = {
  guardian: { w: 720, h: 820 },
  'robot-owl': { w: 900, h: 900 },
  'sign-not-yet-fledged': { w: 420, h: 520 },
  'sign-closed-for-molting': { w: 420, h: 520 },
  'sign-pardon-our-feathers': { w: 420, h: 520 },
  'sign-hatching-soon': { w: 420, h: 520 },
};
const OWL_LAYERS = ['owl-body', 'owl-belly', 'owl-accent', 'owl-face', 'owl-blink'];

/**
 * Loads every piece of art once. Missing files never break the park: a flat
 * placeholder texture is generated instead, so the game is playable before art lands
 * and tolerant of art being swapped.
 */
export class BootScene extends Phaser.Scene {
  private missing = new Set<string>();

  constructor() {
    super('boot');
  }

  create(): void {
    void this.loadArt();
  }

  private async loadArt(): Promise<void> {
    const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    const url = (key: string) => `${base}${ART_PATH}${key}.svg`;
    const jobs: Array<[string, string, number, number]> = [
      ...ROOM_IMAGES.map((k): [string, string, number, number] => [k, url(k), ROOM_W, ROOM_H]),
      ...Object.entries(SET_PIECES).map(([k, s]): [string, string, number, number] => [k, url(k), s.w, s.h]),
      ...OWL_LAYERS.map((k): [string, string, number, number] => [k, url(k), OWL_W, OWL_H]),
    ];

    const { width, height } = this.scale.gameSize;
    const label = this.add.text(width / 2, height / 2, 'Opening the park…', { fontSize: '28px', color: '#F6F1E3', fontFamily: 'system-ui, sans-serif' }).setOrigin(0.5);
    const bar = this.add.rectangle(width / 2, height / 2 + 40, 10, 6, 0xc9a227).setOrigin(0.5);
    let done = 0;
    await Promise.all(
      jobs.map(async ([key, u, w, h]) => {
        const ok = await loadSvgTexture(this, key, u, w, h);
        if (!ok) this.missing.add(key);
        done += 1;
        bar.setSize(Math.max(10, (260 * done) / jobs.length), 6);
      }),
    );
    label.destroy();
    bar.destroy();

    this.ensurePlaceholders();
    if (this.missing.size > 0) console.info(`[owl-park] placeholder art for: ${[...this.missing].join(', ')}`);
    const start = this.registry.get('startRoom') as { room: string; spawn: string | undefined };
    this.scene.start('room', start);
  }

  private ensurePlaceholders(): void {
    const need = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
      if (this.textures.exists(key)) return;
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      draw(g);
      g.generateTexture(key, w, h);
      g.destroy();
    };
    const roomFill: Record<string, number> = { hub: 0x163157, grove: 0x3b2a4a, market: 0x0b0b16 };
    for (const key of ROOM_IMAGES) {
      const isFg = key.endsWith('-fg');
      need(key, ROOM_W, ROOM_H, (g) => {
        if (isFg) return; // transparent
        g.fillStyle(roomFill[key] ?? 0x0c1e36, 1);
        g.fillRect(0, 0, ROOM_W, ROOM_H);
        g.fillStyle(0x2f4f3a, 1);
        g.fillRect(0, 460, ROOM_W, ROOM_H - 460);
      });
    }
    for (const [key, s] of Object.entries(SET_PIECES)) {
      need(key, s.w, s.h, (g) => {
        if (key.startsWith('sign-')) {
          // A small wooden post and board near the bottom of the canvas.
          g.fillStyle(0x5c4033, 1);
          g.fillRect(s.w / 2 - 10, s.h - 150, 20, 150);
          g.fillStyle(0x8b5a2b, 1);
          g.fillRoundedRect(s.w / 2 - 110, s.h - 230, 220, 100, 14);
          g.fillStyle(0xf6f1e3, 1);
          g.fillEllipse(s.w / 2, s.h - 180, 70, 60);
          return;
        }
        g.fillStyle(0xc9a227, 0.18);
        g.fillEllipse(s.w / 2, s.h / 2, s.w * 0.6, s.h * 0.8);
      });
    }
    // Owl placeholder layers: simple shapes so the avatar is readable without art.
    need('owl-body', OWL_W, OWL_H, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(100, 150, 120, 150);
      g.fillCircle(100, 80, 60);
      g.fillTriangle(55, 40, 70, 10, 85, 45);
      g.fillTriangle(145, 40, 130, 10, 115, 45);
    });
    need('owl-belly', OWL_W, OWL_H, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(100, 165, 70, 100);
    });
    need('owl-accent', OWL_W, OWL_H, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(80, 226, 30, 12);
      g.fillEllipse(120, 226, 30, 12);
    });
    need('owl-face', OWL_W, OWL_H, (g) => {
      g.fillStyle(0xf6f1e3, 1);
      g.fillCircle(78, 78, 20);
      g.fillCircle(122, 78, 20);
      g.fillStyle(0x0c1e36, 1);
      g.fillCircle(80, 80, 9);
      g.fillCircle(124, 80, 9);
      g.fillStyle(0xc9a227, 1);
      g.fillTriangle(92, 96, 108, 96, 100, 112);
    });
    need('owl-blink', OWL_W, OWL_H, (g) => {
      g.lineStyle(4, 0x0c1e36, 1);
      g.beginPath();
      g.arc(78, 80, 16, Math.PI * 0.15, Math.PI * 0.85);
      g.strokePath();
      g.beginPath();
      g.arc(122, 80, 16, Math.PI * 0.15, Math.PI * 0.85);
      g.strokePath();
      g.fillStyle(0xc9a227, 1);
      g.fillTriangle(92, 96, 108, 96, 100, 112);
    });
    this.registry.set('missingArt', [...this.missing]);
  }
}

import Phaser from 'phaser';
import { ARCADE_ROOM, CABINETS, CABINET_OFF, type RoomDef } from '@owl-park/shared';

/** Each cabinet's screen on the arcade's painting (room pixels), and its neon colours. */
const SCREENS: Readonly<Record<string, { x: number; y: number; w: number; h: number; ink: string; glow: string }>> = {
  'cabinet-crossing': { x: 494, y: 497, w: 102, h: 73, ink: '#FF8AD0', glow: '#FF2AA1' },
  'cabinet-flight': { x: 758, y: 500, w: 97, h: 70, ink: '#8AF4FF', glow: '#00E5FF' },
  'cabinet-sling': { x: 1022, y: 497, w: 103, h: 73, ink: '#CDB0FF', glow: '#8A4DFF' },
};

/**
 * The arcade's cabinets as the park draws them over the painting: a cabinet whose game is not live
 * yet has its screen switched off, dark and reading "Hatching Soon" in its own neon colour. The
 * screens are part of the back wall, so every owl walks in front of them.
 */
export function addCabinets(scene: Phaser.Scene, room: RoomDef): void {
  if (room.id !== ARCADE_ROOM) return;
  for (const cabinet of CABINETS) {
    const s = SCREENS[cabinet.spot];
    if (!s || cabinet.live) continue;
    scene.add.graphics().fillStyle(0x05060d, 0.88).fillRoundedRect(s.x, s.y, s.w, s.h, 10).setDepth(2);
    scene.add
      .text(s.x + s.w / 2, s.y + s.h / 2, CABINET_OFF.replace(' ', '\n'), {
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: '16px',
        fontStyle: '700',
        color: s.ink,
        align: 'center',
        lineSpacing: 2,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setShadow(0, 0, s.glow, 10, false, true)
      .setDepth(3);
  }
}

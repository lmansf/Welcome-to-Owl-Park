import type { ArcadeGame } from '@owl-park/shared';

/**
 * Each game's neon: its cabinet's colours. Apart from the games' scene, so the room's arcade (its
 * cabinets and the screen's colour) has them without fetching the scene (OP-204).
 */
export const ARCADE_INK: Readonly<Record<ArcadeGame, { ink: number; glow: number; css: string }>> = {
  crossing: { ink: 0xff8ad0, glow: 0xff2aa1, css: '#FF2AA1' },
  flight: { ink: 0x8af4ff, glow: 0x00e5ff, css: '#00E5FF' },
  sling: { ink: 0xcdb0ff, glow: 0x8a4dff, css: '#8A4DFF' },
};

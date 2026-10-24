import { CABINET_OFF, GAMES, type CabinetDef } from '@owl-park/shared';

/**
 * What a cabinet shows (C40): a cabinet whose game is live carries the game's name on its sign;
 * one switched off has a dark screen reading "Hatching Soon" (an approved closed-sign phrase).
 */
export function cabinetFace(cabinet: CabinetDef): { off: boolean; text: string } {
  return cabinet.live ? { off: false, text: GAMES[cabinet.game].name } : { off: true, text: CABINET_OFF.replace(' ', '\n') };
}

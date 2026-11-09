/** The minigames built so far (OP-314), by id: the game plays only these, in the owner's order of picks. */
import { FEATHER_FALL } from './featherFall';
import { HOOT_ECHO } from './hootEcho';
import type { MinigameDef, MinigameId } from './minigame';
import { UPDRAFT_RACE } from './updraftRace';

export const MINIGAMES: Partial<Record<MinigameId, MinigameDef<any>>> = {
  [UPDRAFT_RACE.id]: UPDRAFT_RACE,
  [FEATHER_FALL.id]: FEATHER_FALL,
  [HOOT_ECHO.id]: HOOT_ECHO,
};

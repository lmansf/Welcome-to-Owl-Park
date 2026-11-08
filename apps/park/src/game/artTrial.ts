/**
 * An art trial (`?art=<name>`): a room drawn from layered art that is not part of the build, so the
 * owner can walk a generated look before anything is approved or committed. Without the flag nothing
 * changes: no visitor's page asks for a trial's files, and the edge's page policy lets the browser
 * reach a trial's host only on a page that names a trial (apps/edge/src/guard.ts, ART_TRIAL_HOSTS).
 *
 * A trial gives one room four layers per screen, fitted to the room as it is (its floor, perches and
 * doorways do not move): a backdrop far behind (rate 0.5), a middle distance (0.75), the playable layer
 * that scrolls with the room (1), and an overlay in front of the owls (1.2). Each layer is one picture
 * per screen at the room's tile size; the backdrop is opaque, the other three see-through.
 *
 * `partygrove` (Nov 8): the Party Grove (`hub`), generated with Higgsfield (seedream 4.5) from a
 * layout guide of the room, cut into screens and keyed by hand. Not approved art: a test of the method.
 */
import { ART_TRIAL_HOSTS, ROOM_W, type RoomDef, type RoomTile } from '@owl-park/shared';

const HF = `${ART_TRIAL_HOSTS[0]}/user_3LnTO4owKumXd7qulkbEMBkLMQd`;

/** One screen of a trial: its four layers' files, each a full screen. */
export interface TrialScreen {
  back: string;
  mid: string;
  play: string;
  front: string;
}

export interface ArtTrial {
  /** The room it draws. */
  room: string;
  screens: TrialScreen[];
}

export const ART_TRIALS: Record<string, ArtTrial> = {
  partygrove: {
    room: 'hub',
    screens: [
      {
        back: `${HF}/56d11a89-c7dd-413e-a2ee-90e1ae39d19a.webp`,
        mid: `${HF}/a7e12095-a1f4-4d0b-a871-0a4096fd6ae9.webp`,
        play: `${HF}/d909e8b5-b8bb-4280-88f6-f84ec97807cb.webp`,
        front: `${HF}/f4ab840c-3e13-463b-96b3-cb5dd9529c40.webp`,
      },
      {
        back: `${HF}/9a01c3b9-74e2-4637-a53f-a181a8db3d58.webp`,
        mid: `${HF}/d445a6e7-6be2-44e4-8cd7-ec40d86f4072.webp`,
        play: `${HF}/fe587be5-5d7a-4291-b273-e74326d628eb.webp`,
        front: `${HF}/4826946e-b67c-44f8-9bfe-cb452b093e89.webp`,
      },
      {
        back: `${HF}/58946621-4ba0-4b0c-b9e5-723aed4669fc.webp`,
        mid: `${HF}/3eb09f98-6ee8-4226-af2a-1c87690c0b24.webp`,
        play: `${HF}/4f72d7bc-42ea-45cc-9849-ecff8cd875b2.webp`,
        front: `${HF}/547a2a9e-d136-4c0b-862c-08539d422c45.webp`,
      },
    ],
  },
};

/** The trial this page draws, or null: `?art=<name>` for a trial that exists, on this page only. */
export function artTrialWanted(asked: string | null): string | null {
  return asked && Object.hasOwn(ART_TRIALS, asked) ? asked : null;
}

/** Room pixels each layer fades over where it meets a neighbour (as the tree's layers do). */
const FADE = { back: 220, mid: 230, front: 120 };

type Layer = keyof TrialScreen;

/** The texture key of a trial's layer on screen `i`. */
export function trialKey(name: string, layer: Layer, i: number): string {
  return `art-${name}-${layer}-${i}`;
}

/** Every texture key a trial draws, with the file each loads from. */
export function trialFiles(name: string): Map<string, string> {
  const files = new Map<string, string>();
  ART_TRIALS[name]?.screens.forEach((s, i) => {
    for (const layer of ['back', 'mid', 'play', 'front'] as const) files.set(trialKey(name, layer, i), s[layer]);
  });
  return files;
}

/**
 * The room as trial `name` draws it: its tiles replaced by the trial's four layers, everything else
 * (floor, perches, doorways) as it was. A room the trial is not for, or no trial, comes back as it is.
 */
export function artTrialRoom(room: RoomDef, name: string | null | undefined): RoomDef {
  const trial = name ? ART_TRIALS[name] : undefined;
  if (!trial || trial.room !== room.id) return room;
  const n = trial.screens.length;
  const edges = (i: number, w: number) => ({ ...(i > 0 ? { left: w } : {}), ...(i < n - 1 ? { right: w } : {}) });
  // A faded tile lies over its neighbour, so the screens with two fading edges come last.
  const order = [...trial.screens.keys()].sort((a, b) => Number(a > 0 && a < n - 1) - Number(b > 0 && b < n - 1));
  const layer = (l: Layer, rate: number, fade: number | null): RoomTile[] =>
    order.map((i) => ({ key: trialKey(name!, l, i), x: i * ROOM_W, y: 0, rate, ...(fade ? { fade: edges(i, fade) } : { plain: true }) }));
  return {
    ...room,
    backgrounds: [...layer('back', 0.5, FADE.back), ...layer('mid', 0.75, FADE.mid), ...layer('play', 1, null)],
    foregrounds: layer('front', 1.2, FADE.front),
  };
}

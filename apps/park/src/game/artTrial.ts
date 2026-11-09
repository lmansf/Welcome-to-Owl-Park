/**
 * An art trial (`?art=hollow`): a generated painting the owner walks before anything is approved or
 * committed. It loads from where Higgsfield keeps it (the page policy opens that host only on a trial's
 * page, apps/edge/src/guard.ts), and every other page draws the room as it is.
 *
 * `hollow` (Nov 9): the Great Hollow (`m3-hall`) painted whole by Higgsfield from a picture of the room's
 * own oval, floor edge, doorways and idol spots, laid over the room's drawn floor and wall: under its
 * doorways, idols, roots, floor edge and owls, so where an owl can walk and every way out read as before.
 */
import type Phaser from 'phaser';
import type { RoomDef } from '@owl-park/shared';
import { ART_TRIAL_HOSTS, ART_TRIALS } from '@owl-park/shared/headers';
import { BOWL_DEPTH } from './bowlView';
import { EDGE_DEPTH } from './edgeView';

export interface ArtTrial {
  /** The room it paints. */
  room: string;
  /** Where the painting is kept: one picture of the whole room, stretched to the room's size. */
  file: string;
}

export const ART_TRIAL_FILES: Record<(typeof ART_TRIALS)[number], ArtTrial> = {
  hollow: {
    room: 'm3-hall',
    file: 'https://d2ol7oe51mr4n9.cloudfront.net/user_3LnTO4owKumXd7qulkbEMBkLMQd/ebb1ba9d-3cf9-44e8-9096-fb1bd0584fd2.webp',
  },
};

/** Drawn over the room's own floor and wall, under everything drawn on them. */
export const TRIAL_DEPTH = (BOWL_DEPTH.lines + EDGE_DEPTH.litter) / 2;

/** The trial this page asks for in `room`, if any: `?art=<trial>` naming a trial of that room. */
export function artTrialFor(search: string, room: string): ArtTrial | null {
  const asked = new URLSearchParams(search).get('art') ?? '';
  const trial = Object.hasOwn(ART_TRIAL_FILES, asked) ? ART_TRIAL_FILES[asked as keyof typeof ART_TRIAL_FILES] : undefined;
  return trial && trial.room === room ? trial : null;
}

/** Whether a trial's file comes from a host the trial page's policy lets it fetch. */
export function trialFileAllowed(file: string): boolean {
  return (ART_TRIAL_HOSTS as readonly string[]).some((h) => file.startsWith(`${h}/`));
}

/** The picture behind `file`, fetched so the page can draw it (a same-page copy, as a cross-site picture cannot be). */
async function fetchPicture(file: string): Promise<HTMLImageElement | null> {
  try {
    const res = await fetch(file);
    if (!res.ok) return null;
    const src = URL.createObjectURL(await res.blob());
    const img = new Image();
    const ok = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(img.naturalWidth > 0);
      img.onerror = () => resolve(false);
      img.src = src;
    });
    URL.revokeObjectURL(src);
    return ok ? img : null;
  } catch {
    return null;
  }
}

/** Draws this page's art trial over `room` once its picture arrives; whether it was drawn. */
export async function drawArtTrial(scene: Phaser.Scene, room: RoomDef, search: string = globalThis.location?.search ?? ''): Promise<boolean> {
  const trial = artTrialFor(search, room.id);
  if (!trial || !trialFileAllowed(trial.file)) return false;
  const key = `art-trial-${room.id}`;
  if (!scene.textures.exists(key)) {
    const img = await fetchPicture(trial.file);
    if (!img || !scene.sys.isActive()) return false;
    if (!scene.textures.exists(key)) scene.textures.addImage(key, img);
  }
  scene.add.image(0, 0, key).setOrigin(0).setDisplaySize(room.size.w, room.size.h).setDepth(TRIAL_DEPTH);
  return true;
}

/**
 * An art trial (`?art=hollow`): a generated painting the owner walks before it becomes the room's look.
 * Its picture ships with the build in public/art like every other piece, so it loads from the park itself
 * and the page policy is the same on every page; every page that does not ask for it draws the room as it is.
 *
 * `hollow` (Nov 9): the Great Hollow (`m3-hall`) painted whole by Higgsfield from a picture of the room's
 * own oval, floor edge, doorways and idol spots, laid over the room's drawn floor and wall: under its
 * doorways, idols, roots, floor edge and owls, so where an owl can walk and every way out read as before.
 * The owner asked for it to be copied into the game on Nov 9.
 */
import type Phaser from 'phaser';
import type { RoomDef } from '@owl-park/shared';
import { publishedArtUrl } from './art';
import { BOWL_DEPTH } from './bowlView';
import { EDGE_DEPTH } from './edgeView';

export interface ArtTrial {
  /** The room it paints. */
  room: string;
  /** Its art key: one picture of the whole room in public/art (`<key>.webp`), stretched to the room's size. */
  key: string;
}

export const ART_TRIALS: Record<string, ArtTrial> = {
  hollow: { room: 'm3-hall', key: 'hollow-painted' },
};

/** Drawn over the room's own floor and wall, under everything drawn on them. */
export const TRIAL_DEPTH = (BOWL_DEPTH.lines + EDGE_DEPTH.litter) / 2;

/** The trial this page asks for in `room`, if any: `?art=<trial>` naming a trial of that room. */
export function artTrialFor(search: string, room: string): ArtTrial | null {
  const asked = new URLSearchParams(search).get('art') ?? '';
  const trial = Object.hasOwn(ART_TRIALS, asked) ? ART_TRIALS[asked] : undefined;
  return trial && trial.room === room ? trial : null;
}

function loadPicture(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Draws this page's art trial over `room` once its picture arrives; whether it was drawn. */
export async function drawArtTrial(scene: Phaser.Scene, room: RoomDef, search: string = globalThis.location?.search ?? ''): Promise<boolean> {
  const trial = artTrialFor(search, room.id);
  const url = trial ? publishedArtUrl(trial.key) : null;
  if (!trial || !url) return false;
  const key = `art-trial-${trial.key}`;
  if (!scene.textures.exists(key)) {
    const img = await loadPicture(url);
    if (!img || !scene.sys.isActive()) return false;
    if (!scene.textures.exists(key)) scene.textures.addImage(key, img);
  }
  scene.add.image(0, 0, key).setOrigin(0).setDisplaySize(room.size.w, room.size.h).setDepth(TRIAL_DEPTH);
  return true;
}

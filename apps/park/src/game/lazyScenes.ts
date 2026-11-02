import type Phaser from 'phaser';

/**
 * The arcade's and the climb's scenes, fetched the first time an owl plays one (OP-204): most visits
 * open neither, so neither is in the script the page loads first. Each is added to the game once,
 * after the room, the home screen and the builder, so it draws over the room as it did when the game
 * listed it from the start. A fetch that fails is tried again the next time.
 */
const LOADERS = {
  arcade: () => import('./ArcadeScene').then((m) => m.ArcadeScene),
  climb: () => import('./ClimbScene').then((m) => m.ClimbScene),
};

export type LazyScene = keyof typeof LOADERS;

const fetched = new Map<LazyScene, ReturnType<(typeof LOADERS)[LazyScene]>>();

/** How many frames an added scene may wait for the game to take it (one, when added mid-frame). */
const ADD_FRAMES = 10;

/** The scene `key` in this game, fetched and added if it is not there yet. */
export async function sceneReady(scenes: Phaser.Scenes.ScenePlugin, key: LazyScene): Promise<void> {
  if (scenes.get(key)) return;
  let load = fetched.get(key);
  if (!load) {
    load = LOADERS[key]();
    fetched.set(key, load);
    load.catch(() => fetched.delete(key));
  }
  const scene = await load;
  if (!scenes.get(key)) scenes.add(key, scene, false);
  // Added while the game was mid-frame, a scene waits for the next one.
  for (let i = 0; i < ADD_FRAMES && !scenes.get(key); i++) await new Promise((done) => requestAnimationFrame(() => done(undefined)));
  if (!scenes.get(key)) throw new Error(`the ${key} scene was not added`);
}

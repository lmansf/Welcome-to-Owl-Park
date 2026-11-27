import Phaser from 'phaser';
import { BOWLING_LANE } from '@owl-park/shared';
import type { ParkConfig } from '../config';
import { artScale, loadArtKey } from './art';

/**
 * A piece of the park's own art standing in for a work box: `key` drawn `width` wide, its foot's middle
 * at `foot`, at `depth`. It is added to `into` at once (an empty container, so whoever owns `into`
 * puts it away with the rest) and filled when its picture has loaded; if that never loads, nothing shows.
 */
export function standIn(
  scene: Phaser.Scene,
  key: string,
  foot: { x: number; y: number },
  width: number,
  depth: number,
  into: Phaser.GameObjects.GameObject[],
  words?: { text: string; up: number },
): Phaser.GameObjects.Container {
  const box = scene.add.container(foot.x, foot.y).setDepth(depth);
  into.push(box);
  const cfg = scene.registry.get('config') as ParkConfig | undefined;
  const scale = artScale('piece', cfg?.pixelRatio ?? 1, cfg?.artScaleMax ?? 1);
  void loadArtKey(scene, key, scale).then((ok) => {
    if (!ok || !box.scene) return;
    const img = scene.add.image(0, 0, key).setOrigin(0.5, 1);
    img.setDisplaySize(width, (img.height / img.width) * width);
    box.add(img);
    // Words on the piece (the station's name on its board), in the doorways' sign lettering.
    if (words) {
      box.add(
        scene.add
          .text(0, -words.up, words.text, { fontFamily: 'system-ui, sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#F6F1E3', stroke: '#0C1E36', strokeThickness: 5, align: 'center' })
          .setOrigin(0.5),
      );
    }
  });
  return box;
}

/**
 * A piece the game moves, fades or turns (a bowling pin, the pinecone, the tag feather): a container
 * holding the shape `drawShape` draws, swapped for `key`'s art at `w` × `h` (its middle at `origin`) once
 * that loads. On a painter's or a keeper's tab, or with no art, the shape stays.
 */
export function artOrShape(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  drawShape: (g: Phaser.GameObjects.Graphics) => void,
  opts: { origin?: { x: number; y: number }; keepShape?: boolean } = {},
): Phaser.GameObjects.Container {
  const box = scene.add.container(0, 0);
  const shape = scene.add.graphics();
  drawShape(shape);
  box.add(shape);
  if (opts.keepShape) return box;
  const cfg = scene.registry.get('config') as ParkConfig | undefined;
  const scale = artScale('piece', cfg?.pixelRatio ?? 1, cfg?.artScaleMax ?? 1);
  void loadArtKey(scene, key, scale).then((ok) => {
    if (!ok || !box.scene) return;
    const o = opts.origin ?? { x: 0.5, y: 0.5 };
    box.add(scene.add.image(0, 0, key).setOrigin(o.x, o.y).setDisplaySize(w, h));
    box.remove(shape, true);
  });
  return box;
}

/** The bowling lane's art is 96 tall: its wood fills the lane's 70, from this far below the art's top (its root curl rises above it, its shadow falls below). */
const LANE_ART_H = 96;
const LANE_ART_TOP = 12;

/**
 * The bowling lane on the floor for every visitor: a soft worn strip, and the lane's own art over it
 * once it has loaded, its wood on the lane, at the lane's depth (an owl on the lane is drawn over it).
 */
export function laneArt(scene: Phaser.Scene, into: Phaser.GameObjects.GameObject[]): void {
  const L = BOWLING_LANE;
  const worn = scene.add.graphics();
  worn.fillStyle(0xffd36a, 0.07).fillRoundedRect(L.x, L.y, L.w, L.h, L.h / 2);
  worn.setDepth(L.y);
  into.push(worn);
  standIn(scene, 'bowl-lane', { x: L.x + L.w / 2, y: L.y - LANE_ART_TOP + LANE_ART_H }, L.w, L.y, into);
}

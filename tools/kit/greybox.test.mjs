// The greybox tool's own tests (OP-234): node --test tools/kit/greybox.test.mjs (pnpm kit:test).
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { test } from 'node:test';
import { encodePng, kitRooms, loadShared, renderGreybox } from './greybox.mjs';

const shared = await loadShared();

/** The width, height and raw rows of a PNG this tool wrote. */
function decode(png) {
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  const idat = png.indexOf('IDAT');
  const len = png.readUInt32BE(idat - 4);
  return { w, h, rows: inflateSync(png.subarray(idat + 4, idat + 4 + len)) };
}

test('writes an RGBA PNG of a raster, row by row', () => {
  const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 128]);
  const { w, h, rows } = decode(encodePng({ w: 2, h: 1, data }));
  assert.equal(w, 2);
  assert.equal(h, 1);
  assert.deepEqual([...rows], [0, 255, 0, 0, 255, 0, 255, 0, 128]);
});

test('draws every kit room, at the scale asked for', () => {
  const rooms = kitRooms(shared);
  assert.ok(Object.keys(rooms).includes('l4'));
  for (const room of Object.values(rooms)) {
    const r = renderGreybox(shared, room, { scale: 0.25 });
    assert.equal(r.w, Math.round(room.size.w * 0.25));
    assert.equal(r.h, Math.round(room.size.h * 0.25));
  }
});

test('marks where an owl stands: the floor and every ledge top in white', () => {
  const room = kitRooms(shared)['l4'];
  const r = renderGreybox(shared, room, { scale: 1 });
  const at = (x, y) => [...r.data.subarray((y * r.w + x) * 4, (y * r.w + x) * 4 + 3)];
  const g = room.kit.ground;
  for (const p of room.perches) {
    const x = Math.round((p.area[0].x + p.area[1].x) / 2);
    assert.deepEqual(at(x, g - p.top - 2), [244, 244, 244], p.id);
  }
  assert.deepEqual(at(1300, g - 2), [244, 244, 244]);
});

test('draws the placeholders in the tree palette and leaves no part of the room unpainted', () => {
  const room = kitRooms(shared)['l4'];
  const r = renderGreybox(shared, room, { scale: 0.25, placeholders: true });
  let clear = 0;
  for (let i = 3; i < r.data.length; i += 4) if (r.data[i] !== 255) clear++;
  assert.equal(clear, 0);
});

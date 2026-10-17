# Art pipeline: replacing the placeholder art

Every image in the park lives under `apps/park/public/art/` and is referenced by key. For each
key the game tries, in order: `<key>.svg`, then `<key>@2x.png`, then `<key>.png`. Swap a file and
the park picks it up; the code does not change. Whatever the file's resolution, it is drawn at the
logical size in the table below.

- **SVG** is rasterized when the room opens, at the device's pixel density (rooms and big set pieces
  capped at 1.5x by default, `VITE_ART_SCALE_MAX`; owls and signs up to 2x), so one file is sharp on
  every screen.
- **PNG** is used as-is. Supply `<key>@2x.png` at twice the logical size for phones and `<key>.png`
  at the logical size; the game picks the 2x file on dense screens when it exists.
- Art for a room is loaded when the room opens and released when the visitor leaves it, so memory
  stays at one room's worth whatever the park grows to.

## Files and sizes

| Key | Logical size (px) | What it is |
| --- | --- | --- |
| `hub`, `hub-fg` | 1600 x 900 | Hub room background, and a transparent foreground overlay drawn in front of the owls |
| `grove`, `grove-fg` | 1600 x 900 | Storybook realm background and foreground |
| `guardian` | 720 x 820 | The guardian owl, transparent background, bottom-centre on its perch |
| `market`, `market-fg` | 1600 x 900 | Neon market background and foreground |
| `robot-owl` | 900 x 900 | The giant robot owl behind the skyline, bottom-centre anchored |
| `sign-*` (four keys) | 420 x 520 | Closed-realm signs; the post's base is the bottom-centre |
| `owl-body`, `owl-belly`, `owl-accent` | 200 x 240 | Visitor owl layers drawn pure white; the game tints them with the visitor's colours |
| `owl-face`, `owl-blink` | 200 x 240 | Eyes and beak in fixed colours (not tinted); the blink frame replaces the face for a moment, so it must include the beak |

The owl is five layers, not three: three white tintable layers plus the face and the blink frame.

Owl layers share one canvas: feet on the bottom edge at (100, 240), facing slightly to one side
so a horizontal flip reads as turning around. A 2x PNG set is 400 x 480 with the feet at (200, 480). Owls render at half size (`OWL_SCALE` in `apps/park/src/game/Owl.ts`):
the 200 x 240 canvas becomes 100 x 120, so an owl stands about 100 px tall from head to toes and
about 70 px wide in a 1600-wide room.

## Rules every asset must follow

- Original work only. No text except the four approved closed-realm phrases on the signs.
- No realm names, no company or zoo names, no personal names, in file names, ids, comments or metadata.
- Self-contained SVG: no external images, scripts, fonts or `foreignObject`. Generic font families only.
- A PNG carries no walkable layer, so after replacing a room's art the walkable polygons, doors and
  spawns still need checking with `?debug=1` (see Room geometry below).
- Keep each file under about 200 KB. Modest filters; the image is rasterized once, so detail is free but filters are not.
- Rooms need a clear ground plane in the lower half, nearer is lower, and visible doorways at ground level.

## Preview exactly what the game will show

```bash
pnpm exec playwright install chromium    # once: the renderer uses the test browser
node tools/render-svg.mjs apps/park/public/art/grove.svg /tmp/grove.png 1600 900
```

## Room geometry

Each room's walkable area, doors and spawn points live in `packages/shared/rooms/index.ts`
(shared by the client and the room server),
in room pixels (1600 x 900). When a room's layout changes, update:

- `walkable`: one or more simple polygons the owl may stand on (feet position).
- `doors`: trigger rectangles. Open doors have `to: { room, spawn }`. Closed doors have `closedSign`
  (one of the approved phrases) and show a sign at `marker`. Two spots are not doors: `shop` is the
  gift-shop spot, and `idol` is where visitors stand at the realm's mythical owl to cast a Realm Vote.
- `spawns`: where an owl appears when entering; `default` is required.
- `ANCHORS`: bottom-centre points for large set pieces (guardian, robot owl, tree base).

Check it in the browser with `?debug=1`, which draws the polygons, door rectangles and spawn points.

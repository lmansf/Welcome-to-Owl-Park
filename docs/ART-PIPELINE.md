# Art pipeline: replacing the placeholder art

Every image in the park is an SVG under `apps/park/public/art/`. The game rasterizes each
one once at a fixed size when it opens. Swap a file and the park picks it up; the code does
not change. PNG works too if you rename the loader entries in `apps/park/src/game/BootScene.ts`.

## Files and sizes

| File | Size (px) | What it is |
| --- | --- | --- |
| `hub.svg`, `hub-fg.svg` | 1600 x 900 | Hub room background, and a transparent foreground overlay drawn in front of the owls |
| `grove.svg`, `grove-fg.svg` | 1600 x 900 | Storybook realm background and foreground |
| `guardian.svg` | 720 x 820 | The guardian owl, transparent background, bottom-centre on its perch |
| `market.svg`, `market-fg.svg` | 1600 x 900 | Neon market background and foreground |
| `robot-owl.svg` | 900 x 900 | The giant robot owl behind the skyline, bottom-centre anchored |
| `sign-*.svg` (four files) | 420 x 520 | Closed-realm signs; the post's base is the bottom-centre |
| `owl-body.svg`, `owl-belly.svg`, `owl-accent.svg` | 200 x 240 | Visitor owl layers drawn pure white; the game tints them with the visitor's colours |
| `owl-face.svg`, `owl-blink.svg` | 200 x 240 | Eyes and beak in fixed colours; the blink frame replaces the face for a moment |

Owl layers share one canvas: feet at (100, 232), facing slightly to one side so a horizontal
flip reads as turning around. Owls render at half size, about 55 px tall in a 1600-wide room.

## Rules every asset must follow

- Original work only. No text except the four approved closed-realm phrases on the signs.
- No realm names, no company or zoo names, no personal names, in file names, ids, comments or metadata.
- Self-contained SVG: no external images, scripts, fonts or `foreignObject`. Generic font families only.
- Keep each file under about 200 KB. Modest filters; the image is rasterized once, so detail is free but filters are not.
- Rooms need a clear ground plane in the lower half, nearer is lower, and visible doorways at ground level.

## Preview exactly what the game will show

```bash
node tools/render-svg.mjs apps/park/public/art/grove.svg /tmp/grove.png 1600 900
```

## Room geometry

Each room's walkable area, doors and spawn points live in `apps/park/src/rooms/index.ts`,
in room pixels (1600 x 900). When a room's layout changes, update:

- `walkable`: one or more simple polygons the owl may stand on (feet position).
- `doors`: trigger rectangles. Open doors have `to: { room, spawn }`. Closed doors have `closedSign`
  (one of the approved phrases) and show a sign at `marker`. The `shop` door is the gift-shop spot.
- `spawns`: where an owl appears when entering; `default` is required.
- `ANCHORS`: bottom-centre points for large set pieces (guardian, robot owl, tree base).

Check it in the browser with `?debug=1`, which draws the polygons, door rectangles and spawn points.

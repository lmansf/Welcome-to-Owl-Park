# Writing an asset pack

One pack is one module in `blender/nt/assets/`. Read `nt/vox.py` (the `V` sculpting block and what
`done()` does), then `nt/assets/common.py`, `kit.py` and `owls.py` as worked examples.

## The look

Smooth, organic and hand-painted: soft rounded forms, like a painted storybook made solid, in a night
scene lit by lanterns. Every asset is **sculpted in voxels** and `done()` skins it smooth and paints
it (colours blend softly where they meet, creases fall into blue shadow, tops catch the moon). You
get the painterly finish for free; your job is a good sculpt and good colour placement:

- Build from big rounded masses first (`ball`, `rod`, `path`), then add secondary forms, then paint
  variation over them: `paint` with `noise()` masks for mottling and moss, `top()` for what the sky
  touches, `speckle()` for flecks, stripes and bands with `np.mod` on `v.X / v.Y / v.Z`.
  Aim for three or more colours on anything bigger than a metre; flat single-colour shapes look dead.
- Nothing straight or boxy unless it is man-made, and even then lean it, sag it or round it a little.
  Trunks taper and bend; roofs sag; posts lean. Asymmetry reads as hand-made.
- Features thinner than two voxels melt away in the smoothing. At the default 16 voxels a metre that
  is 12 cm: make chains, stems and rails at least 0.12 m thick, or sculpt the asset finer
  (`V(lo, hi, vpm=32)` for things under about 1.5 m).
- Light comes from the palette's glowing colours (`gold_glow`, `amber_glow`, `moon_glow`, the neon
  and glass colours, ...). Glow bleeds softly into its neighbours, like painted light. Lanterns
  should use `common.lantern(v, at, size)` so the park's light is one family.
- Words are written with `v.text(...)` (capitals, 5 by 7 dots; `px=2` on a `vpm=32`+ block reads well),
  raised a couple of voxels proud of the surface in a contrasting colour.

## Rules

- Axes: X right, Z up; the game camera sits on -Y looking at +Y, so the side toward -Y is the one
  players see. But it is a real 3D world seen in perspective: model all the way round. One unit is a
  metre; the owl is 1 m tall.
- Register with `@asset(name, category, note)`. The builder returns one object from `v.done(name)`,
  or a list whose first object is the root: an empty or a mesh, with the others parented to it by
  `core.child` (see `owls.py`). Split parts only where the brief says the game moves them.
- Origin: props stand on z = 0, centred on x = 0, round y = 0. The owl's path is the strip
  y -0.5 to 0.5: anything the owl walks in front of sits at y > 0.6, anything it stands on has its
  top at z = 0. Hanging things have the origin at the top. Where the brief gives a size, hit it
  exactly (the map's collision is laid to it); smoothing pulls a surface in by a centimetre or two,
  which is fine.
- Pieces that tile pass `open="x"` (or "z", "xz", "+y" ...) so the sculpt runs off that side with no
  skin and the seam stays put; the sculpt must reach those sides.
- Colours: only names in `core.MATS`. For a new one, at the top of your module call
  `vox.register_colour("name", "#hex", emission=0.0)` (emission up to 6); do not edit `core.py`.
  Stay near the park's palette: night navy and dusk blue, bark browns, moss greens, cream, lantern
  gold; each realm adds only its few accents.
- Triangles: `keep` in `done()` is the share kept after thinning. Budget about 1,500 for a prop,
  4,000 for a landmark, 800 for a backdrop piece (use `vpm=8` or `vpm=4` for backdrops and other big
  things: a 10 m panel at 16 voxels a metre is far too heavy). `build_assets.py` prints the largest.
- Check your work: `python build_assets.py --sheets --cat=<category>` writes
  `build/sheets/<category>.png`. Look at the sheet and improve what does not read. A sheet shows
  the whole category small; to judge one asset, temporarily give it a category of its own.

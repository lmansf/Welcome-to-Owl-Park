# Owl Park: The Night Tree

A side-scrolling Owl Park. One owl, one continuous park seen from the side, built around the great
tree: run, jump, flap, glide, dash and wall-kick through it, find the four guardians, ring three
bells and wake the lantern at the crown. Nothing fights back; thorns, moths and falls cost a pane
of glass and a little time.

The world is real 3D (sculpted assets, depth, perspective, fog), and the owl keeps to one path
through it.

```
blender/   Python for Blender: the asset library, the map, and the reference rules
  nt/vox.py        sculpt in voxels, skin smooth, paint per vertex: the one look everything shares
  nt/assets/       the library: owls, the level kit, shared props, and a pack per realm
  nt/world/        the map: builder.py (what a ledge, a shrine, a bridge is) and park.py (where they are)
  nt/sim/          the rules of movement and the camera, in plain Python
  build_assets.py  -> build/library.blend, every asset marked for the Asset Browser (+ contact sheets)
  build_map.py     -> build/world.blend, the whole park as one scene of library instances
  export_library.py, export_world.py  -> what the game loads
  check_map.py     plays the map by search to prove each gate and reach every pick-up
game/      the Godot 4 project: the same rules in GDScript, the dressing, HUD, sound, web export
shared/tuning.json  every number that shapes the feel: speeds, heights, timings, the camera
```

## Build it

Blender's Python module does the building, so no Blender window is needed (a full Blender 5 works
too: `blender -b -P build_assets.py`).

```bash
python -m venv .venv && .venv/bin/pip install bpy        # once (Blender 5.3 as a Python module)
cd blender
../.venv/bin/python build_assets.py --sheets             # the library, and build/sheets/*.png to look at
../.venv/bin/python build_map.py --shots                 # the park in Blender, and build/shots/*.png
../.venv/bin/python export_library.py                    # game/world/library.glb
python export_world.py                                   # game/world/world.json, tuning.json, the parity run
python -m unittest discover -s tests                     # the rules
python check_map.py                                      # the map (several minutes)
```

Then the game, with Godot 4.5:

```bash
cd game
godot --headless --import                                # once after each library export
godot --headless --script res://tests/parity.gd          # the GDScript rules match the Python ones
godot                                                    # play it
godot --headless --export-release Web ../build/web/index.html   # the browser build
```

Open `build/library.blend` in Blender and the Asset Browser shows the library by realm.
`build/world.blend` is the park as one scene: every placed thing is an instance of a library
collection, the collision is a wire object in its own (hidden) collection, and the rules ride along
as a text block.

## Play

Arrows or WASD walk, Space jumps, Shift dashes, Down with jump drops through a ledge, Down in the
air points the talons (bounce off thorns, moths and lanterns). A gamepad works, and a phone gets
touch buttons. Benches save. F8 starts a new night.

## The look

Every asset is **sculpted as voxels** (16 to the metre; the owls finer, the backdrops coarser),
then skinned with a smooth surface and painted per vertex: colours blend where they meet, creases
fall into the night's blue, tops catch the moon, and brushy tone runs over everything. The glow of
a lantern or a pane rides in the vertex alpha, so light bleeds softly into what is next to it. One
sculpt, one skin, one paint and one material for the whole world is what holds it together.
`blender/ASSET-BRIEF.md` is the guide for adding to the library.

## The map

`blender/nt/world/park.py` opens with the plan. The trunk is the spine; each realm opens off it
through an arch, and each realm's guardian grants the move that opens the next arch up:

| Realm | Where | Its guardian grants | Its own trick |
| --- | --- | --- | --- |
| Treetop Commons, Treehouse Clearing | west, on the ground | the flap | the first hops; the pond and the heron |
| The Neon Street, the Blackout Circuit under it | east, z 12 | the dash | light-bridges that take turns over thorns |
| The Ink Garden | west, z 52 | the glide | brush stones that paint bridges which fade |
| The Glass Street and the Glass Tower | east, z 70 | the wall kick | frail glass, a lamp moth, a swinging lantern, rising air, wind |
| The Updraft Canopy | above z 104 | (the crown) | rising air that comes and goes; three bells |
| The Roots | under the floor | | the golden mouse, for an owl with every move |

## Art

The models are made by the scripts here, not by the image pipeline in `tools/art`. The built files
(`build/`, `game/world/library.glb`) are not committed; the owner looks at the contact sheets and
decides what ships, as with all the park's art.

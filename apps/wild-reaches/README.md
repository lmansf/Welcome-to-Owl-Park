# Owl Park: The Wild Reaches

A side-scrolling Owl Park adventure on the Night Tree's engine. One horned owl, one continuous
world with no loading between places: eleven reaches around a great tree, from frozen peaks to a
sunken sea. Learn a move from each reach's guardian, and the move opens the next reach. Ring three
bells to wake the sunwell at the top of the world.

```
blender/   Python for Blender: the asset library, the world, and its proofs
  wr/vox.py            sculpt in voxels, skin smooth, paint per vertex (the daylight paint)
  wr/assets/           the library: the kit in ten reach themes, walls, landmarks, idols, props
  wr/world/reaches.py  the world generator (the plan of reaches, rooms, gates and dressing)
  wr/sim/              the rules of movement (with water and the dive) and the camera, in Python
  owl/build_owl.py     the rigged horned owl; owl/bake_owl.py paints it for the game
  check_map.py         plays the world by search to prove every gate and pick-up
  world_size.py        measures a world: screens with floor in them, metres of floor
  map_preview.py       draws the whole world as one picture (build/map.png)
game/      the Godot 4.5 project: the same rules in GDScript, dressing, HUD, sound, web export
shared/tuning.json     every number that shapes the feel, swimming included
```

## The world

The world is laid out on a grid of rooms 32 m wide and 20 m tall (about 1.3 × 1.5 screens). Each
reach is a block of rooms joined as a maze with loops, with a few rooms opened into great caverns
that hold the reach's landmark. Every room is carved on a 1 m grid. Ledges are never more than 3 m
apart (a plain jump is 3.8 m), so any ungated way can be walked with no moves at all. Gates sit in
the tunnels and shafts between reaches, away from any ledge.

| Reach | Where | Gate in | Guardian grants |
| --- | --- | --- | --- |
| Goldleaf Grove (start) | west of the tree, z 0..60 | | flap |
| The Mistfalls | under the grove | | |
| The Great Tree | the trunk, z -40..60 | flap (a 6 m step) | |
| The Ember Deep | far west, low | flap | dash |
| The Frostfall Peaks | far west, high | dash (a thorn pit under a low roof) | wall kick |
| The Root Colonnades | east, z -20..60 | dash | dive |
| The Gloamglow Caves | under the colonnades | | |
| The Sunken Sea | under everything, z -140..-40 | dive (a flooded sump under a rock lip) | glide |
| The Heartwood Spire | the trunk, z 60..140 | wall kick (a smooth shaft) | |
| The Sunstone Canyon | east, high | glide (rising air up a wide shaft) | (a bell) |
| The Sky Ruins | over everything, z 140..220 | glide, or wall kick from the spire | (two bells, the sunwell) |

Size, measured by `world_size.py` the same way for both games:
**627 screens with floor in them, 16.3 km of floor**. The Night Tree measures 70 screens and
1.1 km. There are 238 feathers, 52 benches, 5 guardians, 3 bells and the sunwell.

The map comes from a seed (`SEED` in `reaches.py`). Change the seed, or the region table, and run
`check_map.py` again before shipping the result.

## Build it

```bash
python -m venv .venv && .venv/bin/pip install bpy scikit-image   # once
cd blender
../.venv/bin/python owl/build_owl.py -- ../build/owl              # the rigged owl (build/owl/Owl.blend)
../.venv/bin/python owl/bake_owl.py                               # the game owl (build/owl-horned.blend)
../.venv/bin/python build_assets.py [--sheets]                    # the library, and contact sheets
../.venv/bin/python export_library.py                             # game/world/library.glb
python export_world.py                                            # world.json, tuning.json, the parity run
python -m unittest discover -s tests                              # the rules
python check_map.py                                               # the world (about half an hour, every core)
python world_size.py && python map_preview.py                     # its size and its picture
```

Then the game, with Godot 4.5:

```bash
cd game
godot --headless --import
godot --headless --script res://tests/parity.gd                   # the GDScript rules match the Python ones
godot                                                             # play
godot --headless --export-release Web ../build/web/index.html     # the browser build
```

To start somewhere else, or to take a picture: `godot -- x=-49 z=5 have=all shot=/tmp/grove.png`
(on the web, the same words go in the query: `?x=-49&z=5&have=all`).

## Play

Arrows or WASD walk, Space jumps (and flaps once you can), Shift dashes, Down with jump drops through
a ledge, Down in the air points the talons. In deep water an owl floats. With the dive, Down swims
under and Up or jump rises, and a jump at the surface leaps out. Benches save. F8 starts over.

## Art

The models are made by the scripts here. Built files (`build/`, `game/world/library.glb`, the
baked owl) are not committed: the owner looks at the contact sheets and screenshots and decides
what ships, as with all the park's art. The look is the Night Tree's sculpt and paint, lit for day:
warm sun on the tops, cool sky in the shadows, two or three accents per reach.

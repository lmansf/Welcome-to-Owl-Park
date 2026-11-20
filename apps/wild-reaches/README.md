# Owl Park: The Wild Reaches

A side-scrolling Owl Park adventure on the Night Tree's engine. One horned owl, one continuous
world with no loading between places: eleven reaches around a great tree, from frozen peaks to a
sunken sea. Learn a move from each reach's guardian, and the move opens the next reach. Ring three
bells to wake the sunwell at the top of the world.

```
blender/   Python for Blender: the asset library, the world, and its proofs
  wr/vox.py            sculpt in voxels, skin smooth, paint per vertex (the daylight paint)
  wr/assets/           the library: the kit in ten reach themes, walls, landmarks, idols, props
  wr/world/atlas.py    the world, drawn by hand: ground lines, caves, caverns, gates, islands
  wr/sim/              the rules of movement (with water and the dive) and the camera, in Python
  owl/build_owl.py     the rigged horned owl; owl/bake_owl.py paints it for the game
  check_map.py         plays the world by search to prove every gate and pick-up
  world_size.py        measures a world: screens with floor in them, metres of floor
  map_preview.py       draws the whole world as one picture (build/map.png)
game/      the Godot 4.5 project: the same rules in GDScript, dressing, HUD, sound, web export
shared/tuning.json     every number that shapes the feel, swimming included
```

## The world

The world is drawn by hand in `blender/wr/world/atlas.py`. The open-air reaches (the grove, the
peaks, the canyon, the sky) are lines of ground under open sky. The caves are paths cut through
rock with caverns on them, each placed and sized for what happens there: the grove's crystal
grotto, the 26 m waterfall hall, the 74 m hollow of the great tree with its spiral climb, the
volcano hall, the drowned temple. Slopes rise a metre at a time, and the owl walks up them. Steeper
ways are shafts with ledges no more than 3 m apart (a plain jump is 3.8 m), and a tunnel that meets
a cavern high on its wall gets a stair down to the floor. So every way that is not a gate can be
walked with no moves. The gates are drawn where the reaches meet.

| Reach | Where | Gate in | Guardian grants |
| --- | --- | --- | --- |
| Goldleaf Grove (start) | west of the tree, z 0..60 | | flap |
| The Mistfalls | under the grove | | |
| The Great Tree | the trunk's hollow, z -22..60 | flap (a door 6 m up the bark, or a 6 m step from the falls) | |
| The Ember Deep | far west, low | flap | dash |
| The Frostfall Peaks | far west, high | dash (a thorn pit under a low roof) | wall kick |
| The Root Colonnades | east, z -20..60 | dash | dive |
| The Gloamglow Caves | under the colonnades | | |
| The Sunken Sea | under everything, z -160..-46 | dive (deep water: a floater only bobs at the top) | glide (on the temple floor) |
| The Heartwood Spire | the trunk, z 60..140 | wall kick (a smooth shaft) | |
| The Sunstone Canyon | east, high | glide (rising air up a wide shaft) | (a bell) |
| The Sky Ruins | over everything, z 140..220 | glide, or wall kick from the spire | (two bells, the sunwell) |

Size, measured by `world_size.py` the same way for both games: **510 screens with floor in them,
9.4 km of floor**. The Night Tree measures 70 screens and 1.1 km. With every move, `check_map.py`
finds the owl can stand in 473 screens (39,000 metre places). It reaches all 11 reaches, all 127
feathers, the 3 bells, all 35 benches and the sunwell. At each stage it reaches the next guardian
and none past it: flap, dash, wall kick, dive, glide.

To change the world, edit the drawing in `atlas.py`. Then run `map_preview.py` to see it and
`check_map.py` to prove it.

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

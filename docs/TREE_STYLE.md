# The tree's style guide: one tree, five heights (OP-215)

The owner, 2026-11-02, walking the tree: the stitching between screens and levels lacks continuity,
every level looks the same, and it is unclear where you are. He asked for one cohesive palette and style
for the whole tree, five heights you can tell apart at a glance (underground, ground level, low off the
ground, high off the ground, top of the canopy), and the entrance at the top, in the canopy, where the
owls' nests are. This guide is the contract for repainting the tree. It keeps section 5 of
`docs/MAP.md` (look, view, keyed layers, sizes) and replaces its single night light with one light per
height, all drawn from one palette.

## 1. One tree

- **One palette for every level.** Bark `#2B1C12` to `#4A3322`, inner wood `#5C4632` to `#8F8068`, moss
  `#3E5A3A` and `#6E8B4E`, leaf `#4F7A3E` and `#8DAE5A`, lantern gold `#C9A227` and `#FFD36A`, cream
  `#F6F1E3`, navy `#0C1E36` to `#07122A`, dusk blue `#2E4C7A`, sky blue `#6F9BC8`. No level brings a
  colour of its own except Neon Roost's neon, kept inside the cave's three bays.
- **The same trunk runs through every level.** Screen 0 of every level is the trunk's screen. The trunk
  is the same width, bark and moss pattern on every level, centred at x 800 of screen 0, narrowing a
  little with height (level 1 about 900 px wide, level 5 about 600). Its edges run off the top and
  bottom of screen 0 so the screens above and below continue it. The stairs live in or around it.
- **The same props everywhere.** One lantern design (a round amber paper lantern on a dark iron hook),
  one plank and railing design, one rope. A level may use more or fewer of them, never a different kind.
- **The same brush.** Clean cel-shaded shapes with soft gradients, no outlines, large flat areas, the
  same detail level in every layer. Back scenery always a step darker and less saturated than the
  platforms.

## 2. Five heights

What changes from height to height is the light, the far layers and what you see below or above you.
The bark, props and brush stay the same.

| Height | Levels | Key light and air | The far layers (sky plate, middle distance) | What tells you where you are |
| --- | --- | --- | --- | --- |
| Underground | 0 (stair foot, challenge stair, Neon Roost's cave) | No moonlight. Lantern gold pools on cool violet-navy (`#1B1A30`) | Deep earth, roots hanging from above, never any sky | Earth and roots overhead; the trunk's base widening into roots |
| Ground level | 1 (west gate, lobby ring, market square, roof run) | Warm late dusk: cream moon low on the left, gold lanterns | The forest floor running away, other great trunks rising out of the top of frame, dusk blue between them | Grass, ferns, stones and path underfoot; trunks going up out of frame |
| Low off the ground | 2 (Hoot Hollow) | Amber, dappled through thick leaves | Lower boughs of neighbouring trees; the forest floor visible 10 to 20 metres below through gaps | The ground below, still near; thick leaves above |
| High off the ground | 3 and 4 (the stained-glass branch, the sky landing) | Cool cream moonlight, clear blue-navy air, a light mist | Neighbouring tree crowns well below the walkway, clouds level with you; level 4 in thin cloud | Treetops below you, clouds beside you; no ground in sight |
| Top of the canopy | 5 (nests street, canopy) | The brightest: full moon high, open sky, warm lantern gold in the nests | Open sky edge to edge with stars, a sea of leaf tops below the walkway | Nothing above but sky; leaf tops all round |

The game backs this up in code (OP-214): a colour grade per height, a card with the height's name on
arrival, a soft fade through the next height's colour on the stairs, and on a computer the minimap
(OP-213).

## 3. Edges and seams

- **Within a level:** every join between two screens is painted as one edit across the join (the seam
  recipe used on level 0, PR 52), so the floor, the trunk line and the far layers continue across it at
  the same heights. No join may show a change of colour, light or brush.
- **Between levels:** the trunk's screen 0 of each level continues the one below and above (section 1),
  and each stair's two ends are painted as the same stair seen from above and below.
- **Overlays** frame the screen's left and right edges only: at most a fifth of the width at each side,
  never the middle three fifths, never over a doorway, cabinet or anything usable, and never below the
  floor line. Thin hanging things (leaves, roots, lantern strings), not trunks. An overlay that is moved
  onto the ground line has no visible cut or mirrored band.
- **Nothing cut by the frame mid-view:** a prop that a faster layer carries to the middle of the view
  is drawn whole or cleared.

## 4. The entrance is the canopy

Already built this way, and kept: a new owl arrives in the tree on level 5's nests street at its own
nest's door (`TREE_ARRIVAL`, door 0, nearest the gate). The street is the nest village at the top of
the tree: the owl's own nest and the other owls' nest doors, and Hatching Soon at the far west end.
East of the street, the front gate sells the Day Ticket (OP-180's sale) and opens into the canopy, whose
entrance stair goes down through the levels. So nothing moves in the layout. What changes is the look:
the street and the canopy are painted as the brightest, most open place in the tree, so arriving there
reads as arriving at the top.

## 5. Repaint order and budget

The repaint keeps every platform's shape and ledge position, so the room data and the tests hold.
Order, one level a turn: level 5 (the entrance, seen first), level 1, level 0, level 2, level 3, level 4.
Per screen, repaint the sky plate and the middle distance first (two layers, four candidates each, about
$0.56 a screen); repaint the back scenery or the overlay only where it fights its height or breaks a
seam. Seventeen screens of far layers come to about $9.50.

# The park's style guide: one tree, five heights, one look for every realm (OP-219)

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

## 4. The entrance and the park's layout (the remap, OP-219)

The owner approved a remap on 2026-11-02, so the park becomes one side-view map in this style. The route
in: the owl's own nest, then the nests street (level 5), then the Gift Shop Gate, then the Realm Gate plaza.

- The Gift Shop Gate is two screens, entered from the nests street. Its shelves stand on both sides of the
  walkway, then come the ticket booth and the turnstiles. Leaving the park walks back through it.
  It is the warmest, best-lit room in the park: lantern gold on inner wood, goods lit from above.
- The Realm Gate plaza sits past the turnstiles, at the top of the canopy, in full sky. It has one portal arch
  per realm. An open arch glows in that realm's accent colour. A realm not open yet has a boarded arch
  with light behind the boards. The trunk stair down into the tree is at the plaza's left end.
- The tree's levels below are for exploring. No realm is reached by climbing.

## 5. Directions and barriers (the owner's rules, 2026-11-02)

- **Down is always left, up is always right.** On every level, the stair down is at the left end and the stair
  up is at the right end, both at floor height. The canopy's way into the tree goes down. Never paint or
  place a doorway so that an owl must hop over one doorway to reach another.
- **Nothing looks explorable unless it is.** Every ledge, branch or path that is painted or drawn either leads
  somewhere an owl can go, or sits behind a clear barrier: a locked gate, a rope, a fallen branch, or a
  boarded arch with a Hatching Soon sign. A barrier looks shut for now but not forever, with a lantern or a
  glow behind it. Paint no climbable-looking branch that leads nowhere.

## 6. Realms: the Commons and the course

Every realm has the same two parts, painted in the same palette with the realm's own accent:

| Realm | Accent | Commons mood | Course look |
|---|---|---|---|
| Treehouse Clearing | leaf `#8DAE5A` | dappled amber, under the lower boughs | Updraft Canopy: fern floor, inside a hollow trunk, open treetops |
| Neon Street | neon pink and cyan on navy | dusk, lanterns and signs | rooftops at night, signs as platforms |
| The stained-glass realm | dusk blue `#6F9BC8` with coloured glass | cool, high, hazy | the glass tower |

- **The Commons** are calm, with no falls. The idol owl stands at the centre, with open floor around it for
  the NPCs, the mini game and the merch stall.
- **The course** has three acts of three or four screens each. Each act has its own look, but the same
  palette and the same ledge style, so a jump always reads the same.
- **Platforms on a course are drawn in code** from one painted ledge style. Paint the sky, the back
  scenery and the middle distance, and leave the playable space bare.
- **Easter eggs** (hidden rooms, a secret character) are painted like any other screen, behind a door that
  can be found.

## 7. The art kit, order and budget

The owner approved a reusable kit with $87 of art in all (2026-11-02, OP-219). It replaces painting each
screen. Every piece is in this palette:

- **The core set**, used everywhere: ten seamless textures (bark, inner wood, planks, moss, leaves, rope,
  stone, earth, roots, cloth) and eighteen keyed shape sheets (platforms, trims, stairs, doors, portal
  arches, barriers, benches, shelves, signs, stalls).
- **One area set per area**: the five heights, the entrance and plaza, and each realm. Each set has three
  accent textures, three prop sheets and seven backdrop layers (two sky, two far, three middle).
- **Course props and landmark pieces** for each course and set piece.
- **Hero screens** (the entrance, the plaza, vistas and each course's last screen) get one generation pass
  guided by the kit. Every other screen is assembled in code from the kit (OP-234).

A texture must tile with no visible edge. A sheet is keyed so the pipeline can cut it into pieces. Every
run's cost is logged, and generation stops at $87. Every piece is shown to the owner before it is
published, and nothing is published without his approval.

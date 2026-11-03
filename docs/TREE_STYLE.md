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

## 2b. Value bands (OP-250)

The owner saw the kit's backdrop layers compete with the walkable floor when the level assembler first
drew rooms from them (PR 86). The three approved target screens (`tools/art/targets/`, OP-249: level 4's
stair screen, the plaza's west end and the Treehouse Clearing's Commons) are painted as one picture under
one light, with the backdrop darker and softer than the floor. The bands below are measured on them, and
every published backdrop layer is held to its band in code: `pnpm art:finish bands --all` pulls a layer
into its band (`tools/art/README.md`), and `tools/art/test_art_tools.py` (`TestBands`) fails any layer
outside it.

**How the numbers are taken** (`tools/art/artlib/bands.py`; `pnpm art:finish bands --measure <png>` prints
them for any screen). Lightness is CIE Lab L (0 to 100), over a layer's opaque pixels (alpha 128 or more):
its mean, and its 95th percentile, which is the brightest rim light that is more than a speck. Local
contrast is the standard deviation of L inside each 32 px block of the screen grid (16 px in a half-size
middle layer, so a block covers the same patch of screen), averaged over the blocks that are at least half
opaque: how hard the layer's edges and texture read at a glance. Saturation is the mean HSV S (0 to 1). On
a target the sky band is the top 30 % of the screen, the backdrop band 30 % to 70 % down, and the floor
band y 740 to 900 (the walkway and what stands on it):

| Target | Sky band | Backdrop band | Floor band |
| --- | --- | --- | --- |
| level 4's stair | L 11.5, p95 44, contrast 4.1, sat 0.65 | L 21.3, p95 48, contrast 4.7, sat 0.62 | L 33.4, p95 82, contrast 10.2, sat 0.45 |
| the plaza | L 16.3, p95 53, contrast 7.1, sat 0.58 | L 29.2, p95 60, contrast 6.5, sat 0.49 | L 64.7, p95 96, contrast 9.6, sat 0.23 |
| the Clearing | L 16.5, p95 42, contrast 7.1, sat 0.44 | L 28.0, p95 77, contrast 11.0, sat 0.48 | L 33.5, p95 68, contrast 8.0, sat 0.52 |

**The bands.** A layer is inside its band when its L mean is in the range and the other three are under
their ceilings:

| Layer | L mean | L p95 at most | Local contrast at most | Saturation at most |
| --- | --- | --- | --- | --- |
| Sky plate (`kit-<area>-sky-*`) | 8 to 20 | 55 | 7.5 | 0.66 |
| Far layer (`kit-<area>-far-*`) | 12 to 26 | 60 | 8 | 0.60 |
| Middle layer (`kit-<area>-mid-*`) | 12 to 32 | 78 | 11 | 0.63 |
| The walkable layer (floor, platforms, the props on them) | 33 to 65 | 96 | 14, and at least 7.5 | 0.70 |
| The front overlay | 6 to 30 | 70 | 10 | 0.60 |

Where each band comes from: the sky band is the targets' sky band (L mean 11.5 to 16.5, p95 42 to 53,
contrast 4 to 7, saturation 0.44 to 0.65) with a little room either side. The middle layer takes the
targets' backdrop band as measured (L mean 21 to 29, p95 48 to 77, contrast 5 to 11), and the far layer,
which sits between the middle and the sky, a step under it toward the sky's numbers. The walkable layer
is the targets' floor band (L mean 33 to 65, p95 68 to 96, contrast 8 to 10): it alone may pass p95 78,
its contrast never drops under 7.5, so it always carries the most, and its ceiling of 14 leaves room for
props and rim light. No target carries a front overlay, so its band is set by the rule, not measured: a
hanging thing at the frame's edge is in front of the light, no lighter than the middle layer and no
harder than it. The lower bounds of the backdrop bands exist so a layer never vanishes into the night;
being darker than the floor is never the fault.

**The rules the bands encode.** The far and middle layers are darker, lower in contrast and softer than
the walkable layer: a little blur (1.6 px far, 1 px middle, at screen scale) and a haze toward the area's
sky colour (14 % far, 7 % middle, the colour sampled from the lower half of the area's `sky-a` plate).
The walkable layer holds the most contrast and the brightest rim light. The ink-wash realm is the one
exception to the direction, not the order: it is washed onto paper cream, so its distance fades toward the
paper rather than the night, and its bands read upward from its floor (sky L mean 75 to 96, far 60 to 85,
middle 40 to 70, the p95 ceilings 99 and 97, the contrast ceilings the same as the park's, saturation at
most 0.2, 0.2 and 0.3); the haze toward its sky is a haze toward the paper.

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

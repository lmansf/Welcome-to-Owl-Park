# The Night Tree: art bible

The standard every asset, effect and screen is held to. Read it before making or reviewing anything.

## 1. Pillars

1. **A storybook at night, lit by lanterns.** The park is dark and safe. Light is warm, small and
   precious: every screen is a pool of lantern gold in a sea of blue. If a screen has no warm light
   in it, it is not finished.
2. **Soft and grown, not built.** Forms are rounded, leaning, sagging, tapering. Even what owls
   built (booths, shops, towers) looks hand-made and a little crooked. No hard boxes, no dead-straight
   lines longer than a metre, no perfect symmetry outside the guardians' faces.
3. **Painted, not rendered.** Colour does the work detail would do elsewhere: mottled washes, a
   cooler shadow side, a warmer lit side, a darker foot. Nothing is one flat colour.
4. **One world.** Five realms, one hand. A neon sign and a paper lantern are cousins of the same
   lantern. Each realm brings two or three accent colours and its own materials, laid over the same
   night blues, bark browns and lantern gold.
5. **The owl always reads.** The player's owl is the brightest warm shape near the middle of the
   screen. Nothing on its path matches its value; nothing in front of it hides it for long.

## 2. Palette

The night: navy #0C1E36, deep #07122A, dusk #2E4C7A. The tree: bark #2B1C12 to #4A3322, inner wood
#5C4632 to #8F8068, moss #3E5A3A and #6E8B4E. The light: lantern gold #FFD36A (glow) and #C9A227
(metal), cream moonlight #F6F1E3, amber #F2B24A.

Realm accents, used sparingly (under a fifth of any asset unless it is a light source):

| Realm | Accents | Materials |
| --- | --- | --- |
| Clearing | amber, rust leaf | moss, thatch, weathered plank |
| Neon street | magenta #FF2AA1, cyan #00E5FF, violet #6E3AFF | dark painted wood, chrome trim, glowing tube |
| Ink garden | ink black, paper cream, seal red | paper, wet ink, grey wash |
| Glass | ruby, emerald, sapphire, amber glass, pale blue | dark lead, glowing panes |
| Canopy | leaf green-black, moonlit moss | bark, leaf, woven twig |
| Roots | glow-worm green, crystal blue | stone, root, damp earth |

Value plan for a screen, darkest to lightest: far backdrop (dark, cool, low contrast) / near
backdrop / the ground and platforms (mid, readable top edge) / props / the owl and pick-ups / light
sources. Tops of things the owl can stand on are always a step lighter than their sides.

## 3. Shape language

- **Big, medium, small.** Every asset has one dominant mass, two or three secondary forms, and a
  scatter of small accents (a knot, a patch of moss, a nail, a drip). An asset with only big forms
  is a blockout; one with only small forms is noise.
- **Silhouette first.** Fill the asset black: can you still tell what it is? A lantern post has a
  crook and a hanging lamp; a bush is lumpy, not a ball.
- **Lean and taper.** Uprights lean two to six degrees and thin toward the top. Roofs sag in the
  middle. Planks bow. Ropes and chains hang in curves.
- **Thickness.** Nothing thinner than 0.12 m at 16 voxels a metre survives the skin. Slender things
  are sculpted finer (`vpm=32`) or made honestly chunky.
- **Scale.** The owl is 1 m. Doors it uses are 1.5 to 2 m. Lanterns are 0.3 to 0.5 m. Guardians are
  5 to 7 m and feel old.

## 4. Painting

- At least three colours on anything over a metre: a base, a variation of it broken in with noise,
  and an accent. Plus what the sky touches (moss, snow-pale highlights, leaf litter) and what the
  ground touches (darker, damper).
- Break large surfaces with direction: bark runs up, planks run along, thatch hangs down, stone is
  blocky, leaves cluster.
- Light sources are a hot core in a slightly darker, more saturated rim, never a flat white ball,
  and something nearby is tinted by them.
- Faces (owls, idols, the heron, the crane) get the most care: eyes read from ten metres, with a
  dark pupil, a lit iris and a tiny cream catch-light.
- Letters are raised and in a colour two value steps from their board.

## 5. Light, air and effects

- Each realm has a mood: a background, a fog colour, an ambient tone and a moon colour. Fog begins
  just behind the path, so backdrops fade into the night in layers.
- Lamps near the owl cast real light; all lamps wear a soft halo.
- **Effects are small, soft and few.** Round soft particles, short lives, eased sizes, additive for
  light and alpha for dust. An effect says one thing: where the owl landed, that a feather was
  found, that air is rising here. No effect covers the owl.
- Ambient life per realm: fireflies and drifting leaves (clearing, canopy), dust in lantern light
  (hollow), slow rain of sparks and steam (neon), ink flecks and mist (ink), glints and falling
  light (glass), spores and drips (roots).

## 6. Budgets

| Kind | Triangles | Sculpt |
| --- | --- | --- |
| Pick-up, small prop | 600 to 1,500 | `vpm=32` under 1.5 m |
| Prop | up to 2,000 | `vpm=16` |
| Landmark, guardian | up to 5,000 | `vpm=12` to `16` |
| Backdrop panel, far scenery | up to 1,200 | `vpm=4` to `8` |
| The owl | about 7,000 | `vpm=32` |

## 7. Review checklist

Grade each asset 1 to 5 on each line; anything with a line under 3 is reworked, and the pack's
average should reach 4.

1. **Reads at game distance.** In the review render's game view (22 m), is it recognisable at once?
2. **Silhouette.** Distinct, asymmetric where it should be, no boxes.
3. **Form hierarchy.** Big, medium and small forms are all present.
4. **Paint.** Three or more colours, directional breakup, a darker foot, sky-touched tops.
5. **Light.** Any glow has a core and a rim and sits where a light would; nothing glows for no reason.
6. **Family.** It belongs beside the bench, the lantern post and the owl; realm accents are sparing.
7. **Craft.** No floating parts, holes, spikes, melted thin bits or smeared paint; sizes in the brief
   are met; inside its triangle budget.
8. **Path.** It does not block the owl's strip (y -0.5 to 0.5) unless the owl stands on it.

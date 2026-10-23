# Art pipeline: replacing the placeholder art

Every image in the park lives under `apps/park/public/art/` and is referenced by key. For each
key the game tries, in order: `<key>.svg`, then (on dense screens) `<key>@2x.webp` and
`<key>@2x.png`, then `<key>.webp` and `<key>.png`. Swap a file and the park picks it up; the code
does not change. Whatever the file's resolution, it is drawn at the logical size in the table below.

- **SVG** is rasterized when the room opens, at the device's pixel density (rooms and big set pieces
  capped at 1.5x by default, `VITE_ART_SCALE_MAX`; owls up to 2x), so one file is sharp on
  every screen.
- **WebP and PNG** are used as-is. Supply `<key>@2x.*` at twice the logical size for phones and
  `<key>.*` at the logical size; the game picks the 2x file on dense screens when it exists. Painted
  room backgrounds (`hub`, `grove`, `market`) ship as lossy WebP, everything else as PNG (overlays,
  set pieces and owl layers need exact alpha and grey levels).
- Art for a room is loaded when the room opens and released when the visitor leaves it, so memory
  stays at one room's worth whatever the park grows to.

## Files and sizes

| Key | Logical size (px) | What it is |
| --- | --- | --- |
| `hub`, `hub-fg` | 1600 x 900 | Hub room background (WebP), and a transparent foreground overlay (PNG) drawn in front of the owls; the hub is three screens wide now and draws no overlay, so `hub-fg` is kept but unused |
| room tiles (`<room>-<part>`) | 1600 x 900 | A room wider (or taller) than one screen is painted in tiles of one screen each, listed in the room's `backgrounds` / `foregrounds` with their offsets; each tile is room-kind art with the same budgets, WebP rule and 2x copy as `hub`, and the game registers it from the room data. Today: the wings `hub-west`, `hub-east`, `grove-west`, `grove-east`, `market-east` and `lobby-west` (WebP), and the end overlays `grove-west-fg` and `market-east-fg` (PNG) |
| `grove`, `grove-fg` | 1600 x 900 | Storybook realm background (WebP) and foreground (PNG) |
| `guardian` | 720 x 820 | The guardian owl, transparent background, bottom-centre on its perch |
| `market`, `market-fg` | 1600 x 900 | Neon market background (WebP) and foreground (PNG) |
| `arcade` | 1600 x 900 | The arcade off the market street's east end (WebP): a neon hall with three game cabinets painted along its back wall under a blank score board; the park draws a cabinet's screen over the painting while its game is off |
| `robot-owl` | 900 x 900 | The giant robot owl behind the skyline, bottom-centre anchored |
| `blockade-<phrase>` (two keys) | 300 x 300 | Construction blockades in the hub's closed arches, each carrying its doorway's approved phrase; transparent PNG, 1x and 2x, bottom-centre on the door's marker |
| `owl-body`, `owl-belly`, `owl-accent` | 200 x 240 | Visitor owl layers: white, with shading as grey luminance and full alpha; the game multiplies them by the visitor's colours |
| `owl-face`, `owl-blink` | 200 x 240 | Eyes and beak in fixed colours (not tinted); the blink frame replaces the face for a moment, so it must include the beak |
| `owl-<species>-body` and the rest (barn, burrowing, snowy, screech) | 200 x 240 | A species' own five layers, by the same rules as the owl's; loaded when an owl of that species shows up, and until then (or without them) it wears the great horned owl's at its own size |
| `item-<id>` (82 keys) | head 140 x 100, face 120 x 60, neck 130 x 80, pet 90 x 90 | Collectible wearables and pets (`docs/COLLECTIBLES.md`), in owl canvas units, drawn at the owl's scale; transparent PNG, 1x and 2x |
| `icon-<id>` (48 keys) | 64 x 64 | Collection icons for the 24 effects and 24 emotes: white with grey shading on transparency; the game multiplies them by the effect's tint (or the emote colour), so one painting serves every colourway |
| `homes-west`, `homes` | 1600 x 900 | The street of nests, two screens (WebP): a lane of tree houses at dusk with six round nest doors; `homes` (x 1600, nearest the lobby) is the painting and `homes-west` (x 0) its wing |
| `nest` | 1600 x 900 | The inside of every nest (WebP): a round room in a trunk with a bare floor and bare wall, because its owner furnishes it |
| `decor-<id>` (16 keys) | 100 to 260 wide, sizes in `art.ts` | Nest furniture, floor and wall pieces: transparent PNG, 1x and 2x, drawn with the bottom centre on its spot |

The site icons and the link-preview card (`apps/park/public/favicon.png`, `apple-touch-icon.png`
and `og-image.jpg`) are not pipeline keys: they are composed from the approved mascot headshot and
the published hub painting, and live outside `art/`, so `check` does not cover them.

The owl is five layers, not three: three white tintable layers plus the face and the blink frame.

Owl layers share one canvas: feet on the bottom edge at (100, 240), facing slightly to one side
so a horizontal flip reads as turning around. Either side works: the game reads which way the
painting faces from where its eyes sit (left of the centre means it faces left) and mirrors it to
face the way the owl walks. A 2x PNG set is 400 x 480 with the feet at (200, 480). Owls render at half size (`OWL_SCALE` in `apps/park/src/game/Owl.ts`):
the 200 x 240 canvas becomes 100 x 120, so an owl stands about 100 px tall from head to toes and
about 70 px wide in a 1600-wide room.

## Rules every asset must follow

- Original work only. No text except the four approved closed-realm phrases on the blockades' signs.
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
in room pixels. One screen is 1600 x 900; the hub and the grove are three screens wide and the
market two, and each painting is the middle screen (the market's first), so a point on the hub's or
the grove's painting sits 1600 px further right in the room than in the painting. When a room's
layout changes, update:

- `walkable`: one or more simple polygons the owl may stand on (feet position).
- `doors`: trigger rectangles. Open doors have `to: { room, spawn }`. Closed doors have `closedSign`
  (one of the approved phrases) and show its blockade, bottom-centre at `marker`, with the walkable floor
  ending in front of it. Two spots are not doors: `shop` is the
  gift-shop spot, and `idol` is where visitors stand at the realm's mythical owl to cast a Realm Vote.
- `spawns`: where an owl appears when entering; `default` is required.
- `ANCHORS`: bottom-centre points for large set pieces (guardian, robot owl, tree base).
- `ROOM_LAYOUT`: raise it, and add the move to `LAYOUT_MOVES`, when positions already in use shift
  (a room growing on the west): the quest items visitors were already handed move with it, in the
  room server's storage and in the browser's.

Check it in the browser with `?debug=1`, which draws the polygons, door rectangles and spawn points.

## Generating art with an image model

The placeholder SVGs can be replaced with painted art from an image model without touching the
game: the pipeline under `tools/art/` produces exactly the files the loader expects. It has two
offline-testable stages. **Generate** (`tools/art/generate.mjs`, Node 22.18 or newer, see
`tools/art/README.md`) turns the job list in `tools/art/prompts.mjs` into raw candidates from a
provider (`mock` for free, offline synthetic images; `fal` for fal.ai, recommended, or `ark` for
BytePlus ModelArk / Volcengine Ark; both run Seedream 5.0 Pro, 4.5 or 4.0 at a few cents per
image, see `tools/art/README.md` for setup, models and prices) and caches them under the
gitignored `work/art/raw/<key>/`. **Finish** (`tools/art/postprocess.py`, Python 3 with Pillow 12
and numpy, aliased as `post.py`) turns one chosen candidate per key into finals, then publishes
them. Nothing in either stage runs git.

Roles: the park owner is the art director. You write the one-time anchors and the realm style
blocks in `prompts.mjs`, pick winners, and direct fixes with flags and notes. The scripts do the
per-asset grind: variants, keying, resizing, grading, size budgets, exports, provenance.

Requirements: Node 22.18 or newer (the generator itself needs no install; `pnpm art:geometry`
reads the TypeScript room data through Node's built-in type stripping, on by default from 22.18),
and for every `pnpm art:finish` command Python 3.11 or newer with Pillow 12 and numpy:
`python3 -m pip install pillow numpy` (a venv is fine; the script says so and exits 2 when they
are missing). `pnpm check` does not need Python.

### The loop

```bash
pnpm art:generate --provider fal --only tree-master --variants 4 --dry-run   # see the requests, no spend
pnpm art:generate --provider fal --only tree-master --variants 4 --max-spend 1
pnpm art:finish sheet tree-master                              # contact sheet in work/art/review/
node tools/art/generate.mjs select tree-master <hash16>        # mark the winner (SELECTED)
pnpm art:finish ref work/art/raw/tree-master/<hash16>.png tools/art/refs/tree-master.png

pnpm art:geometry                     # work/art/geometry.json from packages/shared/rooms
pnpm art:finish guide --all           # work/art/guides/<room>.png, the layout references
pnpm art:generate --provider fal --only hub --variants 4
pnpm art:finish sheet hub && node tools/art/generate.mjs select hub <hash16>
pnpm art:finish room hub --grade hub --strength 0.35          # work/art/final/hub.webp + review
pnpm art:preview --rooms hub                                   # before/after in the game, desktop and phone
pnpm art:finish publish hub --retire-svg --note "variant 3 of 4"
pnpm dev                              # open http://localhost:5173/?debug=1 and walk the room
```

1. **Anchors first.** `tree-master` is the colossal tree that every realm renders in its own
   style; it is the visual through-line of the brand, so budget two anchor rounds (about twelve
   images) before any room. Save the winner as `tools/art/refs/tree-master.png` with
   `pnpm art:finish ref` (at most 1024 px, under 200 KB, metadata stripped) and commit it; every
   room job references it. The prompt blocks that make the realms consistent (`STYLE`, the layout
   block, the negative prompt) live in `prompts.mjs` and are sent with every request, together
   with the tree reference and the room's layout guide. Keep seeds locked (variants are
   `seed + i`), use low-denoise edits for variations, and never ask for another franchise's look.
2. **The hub redo.** The hub is the inside of the tree: visitors stand on the floor of its
   hollow base, a moonlit nave of living wood, with a knothole moon overhead, growth rings on the
   floor and five root buttresses diving under it. Four archways cut into the wood lead into the
   realms (the way back to the lobby is the floor where owls arrive, C43), and the tree changes
   style around each: a cosy storybook arch with lanterns and fireflies on the left, a chrome and
   neon arch on the right, and two sealed arches at the back whose surrounding wood has turned to
   ink wash and to stained glass, with the closed-realm signs (now construction blockades) standing
   in front of them. `BRIEF` in `prompts.mjs` has the full brief; the guide image shows where the
   room data puts the floor, the doors and the blockades.
3. **Pick winners.** `sheet <key>` lays out every candidate with its hash and seed;
   `select <key> <hash16|latest>` marks the one to finish. A candidate from anywhere (a picks
   folder, a hand-edited file) can be finished with `--raw <file>`.
4. **Finish.** `room`, `piece`, `overlay` and `owl` write `work/art/final/<key>.png` (and
   `<key>@2x.png`; `room` writes `<key>.webp` and `<key>@2x.webp`), a `work/art/review/<key>.png` composite with the walkable area, doors,
   spawns and anchors drawn over the art, and a `<key>.post.json` record of every parameter.
   Look at the review image before publishing: the ground plane must start at the polygon's top
   edge, doorways must sit where the door rectangles are, the tree base on its anchor.
5. **Preview.** `pnpm art:preview` shows the finals in the running game, next to the current art,
   on a desktop and a phone screen, without publishing anything.
6. **Check in the game.** `publish` copies the finals into `apps/park/public/art/` and appends
   the provenance line. Then run the park with `?debug=1` and walk every door; adjust the
   polygons in `packages/shared/rooms/index.ts` if the art disagrees with the data, or rerun the
   finish with `--crop`, `--shift-y`, a different grade, or a different candidate.

Rooms go first; a room's overlay (`<room>-fg`) and set piece (`guardian`, `robot-owl`) are
generated afterwards with the published room as a style reference (`@final:<room>` in the job).
The owl master comes last (`owl`), optionally followed by the eyes-closed edit for the blink.

### Wider rooms: wings

A room grows a screen at a time. Each new screen, a wing (`<room>-west` or `<room>-east`), is an
edit of the room's approved painting, so it keeps the painting's light, perspective and brush:

```bash
pnpm art:finish canvas hub-west            # work/art/canvas/hub-west.png: the painting's west edge on grey
pnpm art:generate --provider fal --only hub-west --dry-run
pnpm art:generate --provider fal --only hub-west
pnpm art:finish sheet hub-west && node tools/art/generate.mjs select hub-west <hash16>
pnpm art:finish wing hub --overlay drop    # every screen of the hub finished, with review images
pnpm art:preview --rooms hub
pnpm art:finish publish hub-west hub hub-east --note "west wing D (seed 9214), picked by the art director"
```

The canvas is the painting's outer 800 px (at 2x) beside a screen of flat grey, sent at half
size, and the job's prompt asks for the grey to be painted into one continuous painting, with the
wing's own brief and the room's style block. `wing <room>` puts each selected wing back against
the painting: scaled to the canvas at 2x, its tone matched to the painting near the join (fading
out across the wing), and joined along the cheapest top-to-bottom cut through the 800 px they
share, pulled toward the painting's outer edge so as little of the approved painting as possible
changes. It then cuts the room into screens: each wing, and the painting itself with a blended
band at each join, which is why the room's own key is republished (its provenance keeps the
painting's candidate and names the joins in `tools`). No grade is applied: the painting is graded
already and the wings were painted to match it. The overlay keeps its frame at the room's ends:
`--overlay ends` moves the overlay's pieces that touch the painting's west or east edge to that
end's screen (`<room>-west-fg`, `<room>-east-fg`) and keeps the rest on the painting's screen;
`--overlay drop` leaves the wide room without one (the hub's corner frame, whose straight cuts
would show at the joins). Every screen's review image shows the room geometry as that screen sees
it, and `work/art/review/<room>-wide.png` lays them side by side. `wing` reads the published
`<room>@2x.webp`; once the wings are published that file is the middle screen, so pass the
original painting with `--painting` to stitch again. New keys go in `config/assets.json` (kind
`room`; overlays with `overlay: true`) and in the room's `backgrounds` / `foregrounds`: tests keep
them, the job list and `art.ts` in step.

### Small fixes to a picked painting: cut and patch

When one detail of a picked painting needs repainting (the lobby concept's booth came with a
rooster weathervane), only that detail is edited, so the rest stays exactly as approved:

```bash
pnpm art:finish cut lobby-vane --base-key lobby-concept-b --box 16,0,1040,1024   # work/art/canvas/lobby-vane.png
pnpm art:generate --provider fal --only lobby-vane                               # the edit job: refs @canvas:lobby-vane
pnpm art:finish sheet lobby-vane && node tools/art/generate.mjs select lobby-vane <hash16>
pnpm art:finish patch lobby --base-key lobby-concept-b --edit-key lobby-vane --at 16,0 --box 415,120,630,335
node tools/art/generate.mjs select lobby <hash16>                                # the patched candidate
```

`cut` writes a crop of the picked candidate around the detail, which the edit job sends as
`@canvas:<key>` (a whole painting is too large to send inline and invites a full re-render).
`patch` pastes the edited crop back at `--at`, but only where it differs from the painting, inside
`--box` (crop pixels): the changed pixels, cleaned of specks, closed over small gaps, with
enclosed holes filled, grown a few pixels and feathered, and toned to the painting around the
patch. Every other pixel is the painting's own. The result is a new raw candidate of the target
key whose sidecar names both sources; `room` and `wing` carry a `patch:` line into the provenance.

The arcade's doorway on the market street was made the same way, on the published screen rather
than a raw candidate: `market-arcade-door` is an edit of a crop of `market-east@2x.webp` (`cut
market-arcade-door --base-key market-east --base apps/park/public/art/market-east@2x.webp`),
patched back into it, selected and finished with `room market-east --with-2x --grade none`. The
east overlay's crates stood in front of the new doorway, so they were taken out of
`market-east-fg` (a hand edit recorded in its provenance); its awning stays.

The lobby is built this way and then widened like the other rooms: concept B1 (the art director's
pick) with its owl weathervane is the painting, `lobby-west` is its wing (`pnpm art:finish canvas
lobby-west --painting work/art/final/lobby@2x.webp` before it is published), and the room is two
screens wide with no overlay (`pnpm art:finish wing lobby --overlay drop`). It is not graded
(`--grade none`): the picked concept is kept as it is.

### Grade, regrade, rerun

Every final passes through a deterministic colour grade: `tools/art/palettes/<realm>.json` holds
the realm's anchor colours (hub: navy, gold, cream and a warm-wood ramp; the storybook realm:
ambers, dusk blues, lantern gold, firefly yellow-green, moss; the market: Signal Magenta,
Circuit Cyan, Night Asphalt, Chrome, Violet Haze), its black and white levels and a default
strength. Hues are pulled toward the nearest anchor in Lab chroma while the painted shading
survives; strength 0 is the identity. Edit the JSON and rerun `room`/`piece` from the cached raw
in seconds; `pnpm art:finish grade in.png out.png --realm market --strength 0.6` tries a grade on
any image. The palette file's hash, the strength and the chosen colour count go into provenance.

### Keyed assets and the chroma key

Set pieces, overlays and the owl master are generated on a flat key-colour backdrop (the job's
`key_colour` in `prompts.mjs`, mirrored in `tools/art/config/assets.json` and recorded in the
candidate's sidecar, which is where the finish stage reads it from) and keyed out by the finish
stage: backdrop estimated from the border, distance matte, rim refinement against the subject's
own colour, exact alpha un-mixing, speck removal and hole filling (a component touching the
frame edge, such as a hanging vine, is never a speck; the speck threshold scales with the
subject, not the frame, and dropped components of 200 px or more are listed in a warning), and
a despill that only removes the backdrop's chroma direction and only in excess of the subject's
own colour, so moss stays green against magenta, neon stays magenta against green and a red or
blue owl region is not dulled on the magenta master. The convention the job list sends, and the
one the prompts name: green `#00FF00` for the guardian, the robot owl and the three overlays;
magenta `#FF00FF` for the owl master (red body, green belly, blue accents). When a model paints
another shade of the key (say `#00B140` for `#00FF00`) and the border is uniformly that shade,
the finish keys on it and says so; pass `--key-colour auto` (or `--key-colour #RRGGBB`) to key
on the border colour of any file, and `--trust-key` only when the subject really covers the
border and the backdrop is the requested key. `piece`, `overlay` and `owl` all take these flags,
so a hand-edited file finished with `--raw` needs no sidecar. Limits: translucent effects (glow,
mist, rain) come out as partly opaque colour, so the guardian's glow and the market's rain stay
in `ambience.ts`; hair-thin edges harden; a painted floor or cast shadow must be prompted away
(or cut with `--floor-cut`); ask providers for PNG output, since JPEG ringing leaves a halo.
Overlays must leave the owls visible (a screen of a wider room is checked against the room as that
screen sees it): `overlay --check` fails when opaque pixels cover more than
5 % of the walkable interior (eroded by 60 px; the frame edge is not an edge, owls stand right
at the bottom of the hub, which is why the hub overlay keeps its whole lower half empty) or sit
within 24 px of a spawn, a door centre, a sign, the shop or the gathering spot, and it draws the
composite for you. Two more rules guard what the disc test misses: a closed doorway's lettered
board (the top band of the 300 x 300 blockade, the union of both blockade arts' boards) may be at
most 1 % covered, because every sign phrase must stay readable; and glow painted over the key colour must not
survive keying (more than 0.5 % of the visible pixels bright, saturated and within 45 degrees of
the key's hue fails: green halos round lanterns, while cyan neon next to a green key passes).
Prompts cannot pin props to exact places, so the finish has two deterministic fixes, each recorded
in provenance: `overlay <key> --clear-signs` makes the overlay transparent over the sign boards
(hanging roots then read as passing behind the board) and `--clear-haze` removes keyed glow.

### Collectible items

Each wearable and pet in the catalogue (`packages/shared/src/collectibles.ts`) has an art key
`item-<id>` in `config/assets.json` (kind `item`) and a job in `prompts.mjs`: the item alone on a
chroma backdrop (magenta for green subjects, green for everything else), generated at twice its
logical size and finished as a keyed piece. Colourways are hue rotations done by the game, so
each item is painted once; a test keeps `assets.json` and the catalogue in step. Finish them with
the slot's placement, which matches how `Owl.ts` and `Pet.ts` draw them:

```bash
pnpm art:finish piece item-witch-hat --margin 0.04                     # head: bottom-centre on the crown
pnpm art:finish piece item-round-glasses --margin 0.04 --valign centre # face: centred on the eye line
pnpm art:finish piece item-knit-scarf --margin 0.04 --valign top       # neck: hangs from the top of the canvas
pnpm art:finish piece item-mouse --margin 0.04 --flip                  # pet: feet on the bottom edge, facing right
```

The prompts ask for pets facing left (the way the model draws them most reliably) and `--flip`
turns them to the game's facing-right convention.

Collection icons (`icon-<id>`, one per effect and emote) are jobs too: a single emblem painted in
white and pale grey only, finished like the face items with
`pnpm art:finish piece icon-<id> --margin 0.04 --valign centre`. Until an icon ships, the owl
builder and the emote wheel draw the effect's or emote's simple symbol instead.

### The street of nests, the nest and its furniture

The free area beside the lobby is generated in this order, each step after the one before is
published:

1. `homes`, the street's painting (its east screen, nearest the lobby): a lane of tree houses at
   dusk with three of the six round nest doors and the lane leaving toward the lobby, painted with
   the published grove as its style reference. It takes no layout guide, because a guide draws a
   room's first screen, which here is the wing's.
2. `homes-west`, its wing with the other three doors, painted out from the published painting like
   the other wings: `pnpm art:finish canvas homes-west`, generate and pick, then
   `pnpm art:finish wing homes`.
3. `nest`, the one room every nest uses, with the grove (and its layout guide, once the room data
   exports the nest template as `nest`) as references. It is kept bare: no furniture of its own.
4. The sixteen `decor-<id>` pieces, each alone on a chroma backdrop (magenta for the fern, the
   moss rug and the window box, green for the rest) with the published nest as the style
   reference, finished with `pnpm art:finish piece decor-<id> --margin 0.04`: floor and wall pieces
   alike sit on their spot by the bottom centre.

`room` and `wing` draw the room geometry over their review images, so they need `homes` and `nest`
in `work/art/geometry.json`. The whole set is 42 images, about $3.51 with Seedream 5.0 Pro:
`pnpm art:generate --provider fal --only homes,homes-west,nest,decor-* --dry-run` lists them (the
wing once its canvas exists).

### The owl key-colour convention

One generation yields all five layers. The master is painted in flat key hues and split by hue:
the body (head, wings, torso, tufts) in one pure hue, the chest patch in a second, the accent
parts in a third, each at least 60 degrees from the others and from the backdrop, shading only as
darker tones of the same hue; the eyes (cream ring, dark pupil, a catchlight) and the gold beak
in natural colours. The job's `key_colour` and `regions` (in `prompts.mjs`, copied into the
sidecar) tell the splitter which hue is which, and `tools/art/config/owl-keys.json` holds the
tolerances (hue windows, saturation and value floors, the head rect, the shadow floor). Anything
in the head that is not a key hue becomes the face layer, and everything a face component
encloses (pupils, catchlights) stays with it; feet painted in a fixed colour (gold) also stay
fixed. The three tintable layers are written white with grey shading in their luminance, never in
alpha, because the game tints by multiplication (`Owl.ts`: WebGL `setTint`, and the Canvas
fallback multiplies then masks), so white becomes exactly the visitor's colour and grey a darker
shade of it; shadows never go below 45 % so dark body colours keep their modelling. The blink
frame clears the eyes and draws lids (or takes them from an eyes-closed edit of the master with
`--blink from:<file>`), and keeps the beak. Registration puts the feet on the bottom row at the
horizontal centre, 220 of 240 logical pixels tall, at 200 x 240 and 400 x 480; a silhouette that
is wider on one side of the feet (a tail or wing in the three-quarter pose) is scaled down so it
still fits, and the command warns if anything opaque is left on the canvas edge. `--flip` mirrors a
winner that faces the wrong way, `--debug` dumps the label map and intermediates, and
`--labels <png>` takes a hand-corrected label map (body blue, belly magenta, accent red, face
yellow) when a master needs a manual fix. Opaque specks on the backdrop smaller than 0.2 % of the
owl (`speck_frac`) are dropped before registration, so a stray pixel in a corner cannot shrink it.

The other species are masters of their own, each an edit of the selected great horned master in
the same colour code (`owl-barn-master` and so on in `prompts.mjs`), finished with
`pnpm art:finish owl --species barn` into `owl-barn-body` and the rest, and published with
`pnpm art:finish publish owl-barn`. A species can need different splitter settings, kept under
`species` in `owl-keys.json`: the barn owl's eyes are dark navy discs with no cream ring, close to
the accent hue, so its value floor is higher; rounder heads with wider-set eyes get a wider face
area. The game measures where hats, glasses and scarves sit from each species' own layers.

### File budget and the 2x policy

Every published file must encode under 200 000 bytes. Room backgrounds are WebP: a painted
1600 x 900 room does not fit as PNG even at 64 colours (the first real hub was 569 KB there),
while lossy WebP fits at high quality. `room` encodes with libwebp (method 6), tries quality 90
and steps down to 50 until the file fits, and records the quality in the post record and the
provenance `tools` (`budget: webp q86`). `room --with-2x` adds a 3200 x 1800 WebP for dense
screens under `--budget-2x` (default 640 000 bytes; a painted room lands around 500 KB); without
it the loader falls back to `<key>.webp`, which phones upscale (fine for painterly art, and half
the GPU memory). Everything else is PNG: the finish tries truecolour first, then palettes of 256
down to 64 colours (alpha-preserving for keyed assets), takes the first that fits and records
the colour count; it warns below 128 colours. Dithering is off by default because it inflates
PNGs about tenfold on smooth gradients; `--dither ordered` breaks sky banding at little cost. An
overlay's `--with-2x` PNG may use a relaxed 640 000 byte budget, with a warning and a
`budget_relaxed` flag in provenance. Pieces and owl layers always ship 1x and 2x (2x pieces land
at 120-230 KB). Owl layers are a few KB each and bypass quantization so their grey levels stay
exact. Finals are rewritten by Pillow with no metadata: PNGs carry only IHDR/PLTE/tRNS/IDAT/IEND
chunks, WebPs only VP8/VP8L/VP8X/ALPH (no EXIF, XMP or ICC profile), so no provider metadata
survives; `check` fails on anything else.

### Publish, SVG retirement, the e2e assertion

The loader tries `<key>.svg` first, so a published WebP or PNG is invisible while the placeholder
SVG exists. `publish --retire-svg` moves the SVG to `work/art/retired-svg/` (gitignored); commit
the deletion along with the new file. `apps/park/e2e/park.spec.ts` asserts room texture widths of
`1600 * min(dpr, 1.5)` for an SVG room and 1600 or 3200 (with `@2x`, on a dense screen) for a
painted one. `publish` validates every provenance line before it moves or writes anything, so a
refused note (a user name, an absolute path, a forbidden word) leaves the tree untouched; and it
removes every other raster of the key from `apps/park/public/art/` (a `<key>@2x.*` the new
finish does not have, a PNG the new WebP replaces or the reverse), since the loader prefers a 2x
on dense screens and WebP over PNG and would otherwise keep showing the old art. `pnpm art:finish
check --all` verifies everything published: sizes equal the logical size or exactly twice it,
budgets, chunk allowlists, SVG/raster conflicts, a key published as both PNG and WebP, WebP only
for room backgrounds, a `@2x` with no 1x, overlay rules, owl layer modes and feet, that every
published file has a provenance line whose hash matches the file (a stale or hand-edited file
fails), that no `@2x` is older than its 1x, and the provenance file.

### Provenance and the private word list

`tools/art/provenance.jsonl` (committed) gets one line per published file: the asset, its hash
and size, the colour count, the raw candidate's hash, provider, model, prompt hash, seed and
generation size, the finish parameters as short `tools` entries, and `human_edits` from every
`--note` (which candidate was picked, what was fixed by hand). It never holds prompt text, user
names, host names, absolute paths, environment values or a provider URL's query string (where
presigned credentials live; only the path is kept); the writer refuses lines that would. The
user and host names are matched as whole words in the notes only, so a login that happens to be
part of a tool word (`tom` in `pad_bottom`, `owl` in `owl-body`) never blocks a publish, and the
error names the word it found.
Keep `tools/art/.local/forbidden-words.txt` (gitignored) or `ART_FORBIDDEN_WORDS_FILE` pointing
at your private list of words that must never appear (internal realm names, people, employers,
other games); with it configured both stages check prompts, records and provenance and report
matches on stderr only. Without a list the check is a no-op and says so, so run
`pnpm art:finish check --all` with the list before committing.

### Tests and the offline demo

```bash
pnpm art:test                                # generator (node) and finish (python) tests, offline
pnpm art:finish demo                         # synthetic input through every command in a temp dir
pnpm art:finish demo --from-work work/art    # the same on the generator's mock candidates
```

The Python half needs Pillow 12 and numpy (`python3 -m pip install pillow numpy`); `pnpm check`
is unchanged and does not need them.

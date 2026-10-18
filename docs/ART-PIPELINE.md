# Art pipeline: replacing the placeholder art

Every image in the park lives under `apps/park/public/art/` and is referenced by key. For each
key the game tries, in order: `<key>.svg`, then `<key>@2x.png`, then `<key>.png`. Swap a file and
the park picks it up; the code does not change. Whatever the file's resolution, it is drawn at the
logical size in the table below.

- **SVG** is rasterized when the room opens, at the device's pixel density (rooms and big set pieces
  capped at 1.5x by default, `VITE_ART_SCALE_MAX`; owls and signs up to 2x), so one file is sharp on
  every screen.
- **PNG** is used as-is. Supply `<key>@2x.png` at twice the logical size for phones and `<key>.png`
  at the logical size; the game picks the 2x file on dense screens when it exists.
- Art for a room is loaded when the room opens and released when the visitor leaves it, so memory
  stays at one room's worth whatever the park grows to.

## Files and sizes

| Key | Logical size (px) | What it is |
| --- | --- | --- |
| `hub`, `hub-fg` | 1600 x 900 | Hub room background, and a transparent foreground overlay drawn in front of the owls |
| `grove`, `grove-fg` | 1600 x 900 | Storybook realm background and foreground |
| `guardian` | 720 x 820 | The guardian owl, transparent background, bottom-centre on its perch |
| `market`, `market-fg` | 1600 x 900 | Neon market background and foreground |
| `robot-owl` | 900 x 900 | The giant robot owl behind the skyline, bottom-centre anchored |
| `sign-*` (four keys) | 420 x 520 | Closed-realm signs; the post's base is the bottom-centre |
| `owl-body`, `owl-belly`, `owl-accent` | 200 x 240 | Visitor owl layers: white, with shading as grey luminance and full alpha; the game multiplies them by the visitor's colours |
| `owl-face`, `owl-blink` | 200 x 240 | Eyes and beak in fixed colours (not tinted); the blink frame replaces the face for a moment, so it must include the beak |

The owl is five layers, not three: three white tintable layers plus the face and the blink frame.

Owl layers share one canvas: feet on the bottom edge at (100, 240), facing slightly to one side
so a horizontal flip reads as turning around. A 2x PNG set is 400 x 480 with the feet at (200, 480). Owls render at half size (`OWL_SCALE` in `apps/park/src/game/Owl.ts`):
the 200 x 240 canvas becomes 100 x 120, so an owl stands about 100 px tall from head to toes and
about 70 px wide in a 1600-wide room.

## Rules every asset must follow

- Original work only. No text except the four approved closed-realm phrases on the signs.
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
in room pixels (1600 x 900). When a room's layout changes, update:

- `walkable`: one or more simple polygons the owl may stand on (feet position).
- `doors`: trigger rectangles. Open doors have `to: { room, spawn }`. Closed doors have `closedSign`
  (one of the approved phrases) and show a sign at `marker`. Two spots are not doors: `shop` is the
  gift-shop spot, and `idol` is where visitors stand at the realm's mythical owl to cast a Realm Vote.
- `spawns`: where an owl appears when entering; `default` is required.
- `ANCHORS`: bottom-centre points for large set pieces (guardian, robot owl, tree base).

Check it in the browser with `?debug=1`, which draws the polygons, door rectangles and spawn points.

## Generating art with an image model

The placeholder SVGs can be replaced with painted art from an image model without touching the
game: the pipeline under `tools/art/` produces exactly the files the loader expects. It has two
offline-testable stages. **Generate** (`tools/art/generate.mjs`, Node 22.18 or newer, see
`tools/art/README.md`) turns the job list in `tools/art/prompts.mjs` into raw candidates from a
provider (`mock` for free, offline synthetic images; `ark` for BytePlus ModelArk / Volcengine Ark;
`fal` for fal.ai; both run Seedream models at a few cents per image) and caches them under the
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
pnpm art:generate --only tree-master --variants 6 --dry-run   # see the requests, no spend
pnpm art:generate --provider ark --only tree-master --variants 6 --max-spend 1
pnpm art:finish sheet tree-master                              # contact sheet in work/art/review/
node tools/art/generate.mjs select tree-master <hash16>        # mark the winner (SELECTED)
pnpm art:finish ref work/art/raw/tree-master/<hash16>.png tools/art/refs/tree-master.png

pnpm art:geometry                     # work/art/geometry.json from packages/shared/rooms
pnpm art:finish guide --all           # work/art/guides/<room>.png, the layout references
pnpm art:generate --provider ark --only hub --variants 4
pnpm art:finish sheet hub && node tools/art/generate.mjs select hub <hash16>
pnpm art:finish room hub --grade hub --strength 0.35          # work/art/final/hub.png + review
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
2. **The hub redo.** The brief: the same tree, seen from its roots, its trunk base at the centre
   of the ground plane; an open root archway at the far left glowing amber with fireflies (the
   storybook realm) and one at the far right spilling magenta and cyan neon and rain (the
   market); two dark closed hollows between them where the closed-realm signs stand; lantern-lit
   roots forming a shallow amphitheatre. The guide image shows where the data puts all of this.
3. **Pick winners.** `sheet <key>` lays out every candidate with its hash and seed;
   `select <key> <hash16|latest>` marks the one to finish. A candidate from anywhere (a picks
   folder, a hand-edited file) can be finished with `--raw <file>`.
4. **Finish.** `room`, `piece`, `overlay` and `owl` write `work/art/final/<key>.png` (and
   `<key>@2x.png`), a `work/art/review/<key>.png` composite with the walkable area, doors,
   spawns and anchors drawn over the art, and a `<key>.post.json` record of every parameter.
   Look at the review image before publishing: the ground plane must start at the polygon's top
   edge, doorways must sit where the door rectangles are, the tree base on its anchor.
5. **Check in the game.** `publish` copies the finals into `apps/park/public/art/` and appends
   the provenance line. Then run the park with `?debug=1` and walk every door; adjust the
   polygons in `packages/shared/rooms/index.ts` if the art disagrees with the data, or rerun the
   finish with `--crop`, `--shift-y`, a different grade, or a different candidate.

Rooms go first; a room's overlay (`<room>-fg`) and set piece (`guardian`, `robot-owl`) are
generated afterwards with the published room as a style reference (`@final:<room>` in the job).
The owl master comes last (`owl`), optionally followed by the eyes-closed edit for the blink.

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
Overlays must leave the owls visible: `overlay --check` fails when opaque pixels cover more than
5 % of the walkable interior (eroded by 60 px; the frame edge is not an edge, owls stand right
at the bottom of the hub, which is why the hub overlay keeps its whole lower half empty) or sit
within 24 px of a spawn, a door centre, a sign, the shop or the gathering spot, and it draws the
composite for you.

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
yellow) when a master needs a manual fix.

### File budget and the 2x policy

Every published PNG must encode under 200 000 bytes. The finish stage tries truecolour first,
then palettes of 256 down to 64 colours (alpha-preserving for keyed assets), takes the first that
fits and records the colour count; it warns below 128 colours. Dithering is off by default
because it inflates PNGs about tenfold on smooth gradients; `--dither ordered` breaks sky
banding at little cost. Rooms ship at 1600 x 900 only: a 3200 x 1800 painterly room cannot meet
the budget as PNG and the loader falls back to `<key>.png`, which phones upscale (fine for
painterly art, and half the GPU memory). `room --with-2x` opts a room in under a relaxed
640 000 byte budget with a warning and a `budget_relaxed` flag in provenance. Pieces and owl
layers always ship 1x and 2x (2x pieces land at 120-230 KB). Owl layers are a few KB each and
bypass quantization so their grey levels stay exact. Finals are rewritten by Pillow with only
IHDR/PLTE/tRNS/IDAT/IEND chunks, so no provider metadata survives; `check` fails on anything
else.

### Publish, SVG retirement, the e2e assertion

The loader tries `<key>.svg` first, so a published PNG is invisible while the placeholder SVG
exists. `publish --retire-svg` moves the SVG to `work/art/retired-svg/` (gitignored); commit the
deletion along with the PNG. Also note `apps/park/e2e/park.spec.ts` asserts room texture widths
of `1600 * min(dpr, 1.5)`, which only holds for rasterized SVG: when the first room ships as PNG
that assertion must accept 1600 (1x only) or 3200 (with `@2x`). `publish` validates every
provenance line before it moves or writes anything, so a refused note (a user name, an absolute
path, a forbidden word) leaves the tree untouched; and a finish without a 2x removes a stale
`<key>@2x.png` left by an earlier publish, since dense screens would otherwise keep showing the
old art. `pnpm art:finish check --all` verifies everything published: sizes equal the logical
size or exactly twice it, budgets, chunk allowlist, SVG/PNG conflicts, overlay rules, owl layer
modes and feet, that every published PNG has a provenance line whose hash matches the file (a
stale or hand-edited PNG fails), that no `@2x` is older than its 1x, and the provenance file.

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

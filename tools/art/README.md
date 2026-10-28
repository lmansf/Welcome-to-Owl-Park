# Art generator (stage 1 of the art pipeline)

`generate.mjs` turns the job list in `prompts.mjs` into raw image candidates from an image
model, caches them, and keeps a provenance log. A second stage (`post.py`, Python + Pillow) turns
a chosen candidate into the files `apps/park/src/game/art.ts` loads. Nothing here touches git or
`apps/park/public/art/`; the raw output lives in the gitignored `work/art/`.

Requirements: Node 22.18 or newer for the generator (built-ins only, no install step;
`pnpm art:geometry` imports the TypeScript room data and relies on Node's type stripping, which
is on by default from 22.18 and passed explicitly by the script), and Python 3.11 or newer with
Pillow 12 and numpy for the finish stage (`python3 -m pip install pillow numpy`; a venv is fine).

## Setting up Seedream

The recommended provider is **fal.ai**: sign in at <https://fal.ai>, add a few dollars of credit
under Billing, and create a key under Keys. Expose it as `FAL_KEY`:

- On your own machine: `export FAL_KEY=...` (or keep it in the gitignored `tools/art/.local/.env`
  and `source` that file). Then `pnpm install`, `pnpm exec playwright install chromium` (for the
  preview) and `python3 -m pip install pillow numpy`.
- In a Claude Code cloud session: add `FAL_KEY` to the environment's secrets or environment
  variables, and add these hosts under Network access, Allowed domains: `queue.fal.run` (requests
  and results) and `fal.media`, `v3.fal.media`, `v3b.fal.media` (where fal serves the images).
  Start a new session afterwards; settings apply to new sessions. With `FAL_SYNC_MODE=1` fal
  returns images inline, which removes the need for the media hosts where the model supports it.

BytePlus ModelArk (`--provider ark`, `ARK_API_KEY`, host `ark.ap-southeast.bytepluses.com`) works
the same way; its model ids are less certain, so check the first response.

### Which Seedream

`node tools/art/generate.mjs models` lists the families the generator knows; pick one with
`--model` or `ART_MODEL`. Each family has its own size limits, and every job is scaled into them
with its aspect ratio kept (the finish stage resizes to the game's exact sizes either way), so the
same job list works with all three. Prices are fal.ai's list prices as of October 2026.

| `--model` | Model | Size limits | fal.ai price | Full default batch |
| --- | --- | --- | --- | --- |
| `seedream-v5-pro` (default) | Seedream 5.0 Pro, the newest | 1 to 4.2 megapixels (rooms come out 2728x1536) | $0.0675 up to 2.4 MP, $0.135 above | about $4.30 |
| `seedream-v4.5` | Seedream 4.5 | 3.7 to 16.8 MP, sides up to 4096 (rooms native 3200x1800) | $0.04 | about $1.40 |
| `seedream-v4` | Seedream 4.0 | sides 1024 to 4096 | $0.03 | about $1.05 |

With 5.0 Pro the rooms are generated at 2728x1536 and upscaled about 17 percent to the 3200x1800
file phones use; 4.5 generates them at full size, so compare both if phone sharpness matters.

## Running it

```bash
pnpm art:generate --dry-run                          # every request, redacted, no calls (mock provider)
pnpm art:generate                                    # mock provider: synthetic PNGs, offline, free
pnpm art:geometry                                    # work/art/geometry.json for the post stage's layout guides

pnpm art:generate --provider fal --only tree-master --variants 4 --dry-run   # exact requests and cost, no spend
pnpm art:generate --provider fal --only tree-master --variants 4             # needs FAL_KEY
pnpm art:generate --provider fal --model seedream-v4.5 --only hub --variants 4

node tools/art/generate.mjs list hub                 # candidates: hash, seed, size, bytes, selected
node tools/art/generate.mjs select hub <hash16|latest>   # marks the winner for the post stage (SELECTED)
node tools/art/generate.mjs cost --provider fal      # what a run would cost before running it
node tools/art/generate.mjs models                   # the Seedream families, limits and prices

pnpm art:preview                                     # before/after screenshots of finished art in the game
```

Providers:

- `mock` (default): no network. Draws deterministic PNGs per job kind with a flat key-colour
  backdrop for keyed assets, so the whole chain, including the post stage, runs in a sandbox and
  in tests. Identical request, identical bytes.
- `ark`: BytePlus ModelArk (international) or Volcengine Ark (China) images API, Seedream models.
  Needs `ARK_API_KEY`.
- `fal`: fal.ai queue API for the same models. Needs `FAL_KEY`. Recommended.

Cost: the estimate follows the chosen model, the generated size and the number of reference
images (table above; `ART_PRICE_USD` overrides it with a flat per-image price when the list
prices change). The whole default job list is 35 images; `--max-spend` (default $5) refuses to
start a run that would cost more, and the cache means reruns cost nothing. Start a provider with
one cheap job and `--variants 1`: the endpoints, size limits and prices come from the providers'
model pages as of October 2026, but no real request could be made while the tool was built, so
check the first response.

### Preview before publishing

`pnpm art:preview` builds the client, lays every final (WebP or PNG) in `work/art/final/` over a copy of it, and
screenshots each affected room on a desktop and a phone screen with a few visitor owls walking
about, next to the same room with the current art. It writes
`work/art/preview/<room>-<view>-compare.png` (plus the two halves) and changes nothing under
`apps/park`. Options: `--rooms hub,grove`, `--views desktop`, `--owls 1..8`, `--focus <room x>` (where the
visitors gather, e.g. `2400` for the middle of a three-screen room), `--finals <dir>`,
`--out <dir>`. It renders the game in a headless browser, which takes about two minutes per room
and screen on a small machine without a GPU (all three rooms on both screens took 13 minutes).

Secrets come from the environment only and are never printed or written. You may keep them in
`tools/art/.local/.env` (gitignored) and `source` it in your shell; the tool never reads it.

## Flags

| Flag | Meaning |
| --- | --- |
| `--provider mock\|ark\|fal` | default `ART_PROVIDER`, else `mock` |
| `--model <family>` | `seedream-v5-pro` (default), `seedream-v4.5` or `seedream-v4`; default `ART_MODEL` |
| `--only k1,k2` | job keys to run; globs allowed (`owl-*`, `*-fg`) |
| `--variants N` | seeds `seed .. seed+N-1` for each job, overriding the job's own count |
| `--seed S` | override every job's base seed |
| `--dry-run` | print each request (secrets as `***`), the cache path, hit/miss and cost; make no calls; exit 0 |
| `--out <dir>` (alias `--work`) | work directory, default `ART_WORK_DIR` or `work/art` |
| `--now <ISO-8601>` | the timestamp written into sidecars and the log (default `ART_NOW`, else the clock) |
| `--concurrency N` | parallel requests, default 2 |
| `--fail-fast` | stop after the first failed job |
| `--force` | ignore the cache and regenerate |
| `--max-spend <usd>` | refuse to start when the uncached jobs would cost more (default 5) |
| `--require-refs` | treat every reference slot as required |
| `--prompts <file.mjs>` | an alternative job list |

Exit code 1 when any job failed or the list is invalid, 2 for usage errors.

## Environment

Resolution order: flag, then environment, then `DEFAULTS` in `prompts.mjs`, then built-in.

| Variable | Default | Notes |
| --- | --- | --- |
| `ART_PROVIDER` | `mock` | |
| `ART_WORK_DIR` | `work/art` | |
| `ART_NOW` | clock | sidecars record `now_source: flag\|env\|clock` |
| `ART_HTTP_RETRIES` | `5` | network errors, 408, 425, 429, 5xx; 1 s × 2ⁿ ±20 %, `Retry-After` honoured |
| `ART_HTTP_TIMEOUT_MS` | `120000` | per request |
| `ART_CONCURRENCY` | `2` | |
| `ART_MAX_SPEND` | `5` | USD |
| `ART_MODEL` | `seedream-v5-pro` | the Seedream family: sets the endpoints, the ark model id, size limits and prices |
| `ART_PRICE_USD` | unset | a flat estimated price per image, replacing the model's list prices |
| `OWL_PARK_FORBIDDEN`, `ART_FORBIDDEN_WORDS` | unset | comma-separated private word list (see below) |
| `ART_FORBIDDEN_WORDS_FILE` | `tools/art/.local/forbidden-words.txt` | one entry per line, `#` comments |
| `ARK_API_KEY` | unset | required for `ark` |
| `ARK_BASE_URL` | `https://ark.ap-southeast.bytepluses.com` | Volcengine: `https://ark.cn-beijing.volces.com` |
| `ARK_IMAGES_PATH` | `/api/v3/images/generations` | |
| `SEEDREAM_MODEL` | from `ART_MODEL`: `dola-seedream-5-0-pro-260628`, `seedream-4-5-251128` or `seedream-4-0-250828` | Volcengine ids start with `doubao-`; check BytePlus's model list |
| `ARK_RESPONSE_FORMAT` | `url` | or `b64_json` |
| `ARK_SIZE_MODE` | `wxh` | `preset` sends `1K`/`2K`/`4K` by the larger side, or `ARK_SIZE_PRESET` |
| `ARK_REF_MODE` | `data` | `url` requires `https://` refs you host |
| `ARK_IMAGE_FIELD` | `image` | reference-image field (array) |
| `ARK_WATERMARK` | `false` | |
| `ARK_SEQUENTIAL` | `disabled` | `sequential_image_generation` |
| `ARK_NEGATIVE_FIELD` | unset | when set, `NEGATIVE_PROMPT` is sent in that field |
| `ARK_EXTRA_JSON` | `{}` | merged into the body last, e.g. `{"output_format":"png"}` |
| `FAL_KEY` | unset | required for `fal` |
| `FAL_ENDPOINT` | from `ART_MODEL`, e.g. `https://queue.fal.run/bytedance/seedream/v5/pro/text-to-image` | |
| `FAL_EDIT_ENDPOINT` | from `ART_MODEL`, e.g. `https://queue.fal.run/bytedance/seedream/v5/pro/edit` | used when a job has references |
| `FAL_SYNC_MODE` | `false` | `sync_mode`: the image comes back inline, no media-host download |
| `FAL_REF_FIELD` | `image_urls` | |
| `FAL_REF_MODE` | `data` | as for ARK |
| `FAL_POLL_MS` | `2000` | status polling interval |
| `FAL_TIMEOUT_MS` | `300000` | queue wait limit |
| `FAL_SAFETY` | `true` | `enable_safety_checker` |
| `FAL_NEGATIVE_FIELD` | unset | as for ARK |
| `FAL_EXTRA_JSON` | `{}` | merged into the body last |

Per-job overrides for one provider go under `providers: { ark: {...}, fal: {...} }` in the job
and are merged before `*_EXTRA_JSON`.

The numeric variables (`ART_HTTP_RETRIES`, `ART_HTTP_TIMEOUT_MS`, `ART_CONCURRENCY`,
`FAL_POLL_MS`, `FAL_TIMEOUT_MS`: non-negative integers; `ART_MAX_SPEND`: a non-negative number)
are validated exactly like the flags: anything else is a usage error (exit 2) naming the variable.

## The job list (`prompts.mjs`)

Everything the art director edits is in one data file: the hub brief, the three realm `STYLE`
blocks, the `PROMPTS` (one per key), the `NEGATIVE_PROMPT`, and `JOBS` with kind, realm,
generation size, base seed, variant count, key colour, owl region colours and reference slots.
Keys are validated against `config/assets.json` (mirrored from `art.ts`, guarded by a test) plus
the helper keys `tree-master`, `owl-master`, `owl-blink-src` and the four species masters
(`owl-barn-master`, `owl-burrowing-master`, `owl-snowy-master`, `owl-screech-master`). The five
`wing` jobs (`hub-west`, `hub-east`, `grove-west`, `grove-east`, `market-east`) paint a room a
screen wider; they hold the prompts the approved wings were painted from, and a test checks those
against the published provenance.

Reference slots (`refs`) point at `refs/<file>` (committed anchors in `tools/art/refs/`, 1024 px
and 200 KB at most, chosen by the art director), `@guide:<room>` (the post stage's layout guide),
`@final:<key>` (a published PNG, or the WebP of a room or a key marked webp), `@raw:<key>` (another job's SELECTED candidate) or
`@canvas:<key>` (a wing's outpaint canvas, `work/art/canvas/<key>.png`, written by
`pnpm art:finish canvas <key>`). Slots marked
`optional` are skipped with a notice until the file exists, which is why the first runs work
before any anchor is chosen; a job marked `optional` (the blink edit) is skipped when its required
reference is missing. References travel as data URLs by default (2 MB each at most, 14 per
request) or as hosted URLs with `*_REF_MODE=url`.

The intended order: `tree-master` first (pick a winner, save it as `refs/tree-master.png`), then
the rooms, then `pnpm art:geometry` and the post stage's guides, publish a room, then its overlay
and set piece with the published room as a style reference, then `owl-master`, `select` it, then
`owl-blink-src`. The species masters are edits of the selected `owl-master` too, so each keeps its
pose and colour code and changes only its species' shape and markings. Their jobs ask fal for
PNG, since its edit endpoint otherwise answers in JPEG. A wing comes after its room is published:
`canvas` puts the painting's edge on grey, the job paints the grey (3040 x 1368, PNG), and the post
stage's `wing <room>` stitches the selected wing back onto the painting (`docs/ART-PIPELINE.md`).

## Output contract (read by the post stage)

```
work/art/raw/<key>/<hash16>.png|jpg   the raw candidate
work/art/raw/<key>/<hash16>.json      its sidecar
work/art/raw/<key>/SELECTED           the hash16 of the chosen candidate (written by `select`)
work/art/log.jsonl                    one line per attempt (ok | cached | failed)
work/art/geometry.json                rooms (with their art tiles), doors, spawns, anchors, closed signs, assets table
work/art/canvas/<key>.png             a wing's outpaint canvas (written by the post stage, read as @canvas:<key>)
```

`hash16` is the first 16 hex digits of `sha256(provider + "\n" + model + "\n" + canonical JSON of
the request body)` with every reference replaced by `sha256:<hex of its bytes>`, so the same
request from any machine lands on the same file, and a job whose sidecar exists is a cache hit.

Sidecar fields: `schema`, `key`, `kind`, `realm`, `provider`, `model`, `hash16`, `prompt_sha256`,
`seed`, `seed_returned`, `size`, `width`, `height`, `format`, `key_colour`, `refs` (`ref`,
`sha256`), `source_url` (the provider's result URL with its query string and fragment removed:
presigned URLs carry credentials and signatures there, and the sidecar ends up in the committed
provenance file), `generated_at`, `now_source`, `cost_estimate_usd`, `provider_meta` (size,
usage, request_id only); owl jobs add `regions` (the flat fills of body, belly and accent) and
`derives` (the five layer keys). No prompt text is stored, only its hash.

Log lines carry only `ts, key, provider, model, prompt_sha256, seed, size, hash16, status,
source_url, error, human_edits`; the free-text fields (`error`, `human_edits`) are scrubbed of
the user name, home directory and host name (the fixed fields such as `key` are left alone, so a
login such as `owl` cannot corrupt `robot-owl`), absolute paths are rejected in every field, and
`--dry-run` writes nothing.

## The private forbidden-word list

This repository is public, so the list of words that must never appear (internal realm names,
people, employers, other games) is private too. Put it in `tools/art/.local/forbidden-words.txt`
(gitignored), or pass `OWL_PARK_FORBIDDEN="a,b"` / `ART_FORBIDDEN_WORDS_FILE=...`. Entries match
case-insensitively as substrings; prefix one with `=` for whole-word matching. With a list
configured the job list, the blocks and every log line are checked and a match stops the run;
matches are printed to stderr only. Without a list the check is a no-op and says so.

## Tests

```bash
node --test "tools/art/**/*.test.mjs"    # or: pnpm art:test
```

Covers the PNG encoder (header and pixels parsed back), the mock provider (deterministic, keyed
borders, requested size), the job list (every generated key in `art.ts` has a job, `assets.json`
matches `art.ts`, prompts are the approved defaults), the cache key, both HTTP providers against a
stubbed `fetch` (request shapes, b64/url responses, queue polling, retry and backoff), the CLI
(`--dry-run` redaction, `--max-spend`, variants, `select`, `geometry` and its Node-version
guard, the validation of numeric environment settings), the stripping of presigned result URLs,
the mock overlay's empty lower half, and the forbidden-word check and log writer.
